use chrono::Local;
use log::{debug, error, info, warn};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

// 全局状态来存储sidecar进程的引用
#[derive(Default)]
pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    info!("Greet command called with name: {}", name);
    let response = format!("Hello, {}! You've been greeted from Rust!", name);
    debug!("Greet response: {}", response);
    response
}

#[cfg(windows)]
fn force_kill(pid: u32) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F", "/T"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();
}

// 启动Python sidecar作为后台服务
async fn start_python_service(app: AppHandle) -> Result<(), String> {
    info!("🐍 创建 Python sidecar 命令...");

    let sidecar_command = app
        .shell()
        .sidecar("python-sidecar")
        .map_err(|e| {
            let error_msg = format!("Failed to create sidecar command: {}", e);
            error!("{}", error_msg);
            error_msg
        })?
        .args(["port", "8000"]);

    info!("🚀 生成 Python sidecar 进程...");
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        let error_msg = format!("Failed to spawn sidecar: {}", e);
        error!("{}", error_msg);
        error_msg
    })?;

    info!("✅ Python sidecar 进程生成成功，PID: {}", child.pid());

    // 存储child进程引用到全局状态
    let state: State<SidecarState> = app.state();
    if let Ok(mut child_guard) = state.child.lock() {
        *child_guard = Some(child);
        info!("💾 已将 Python sidecar 进程引用存储到全局状态");
    } else {
        warn!("⚠️ 无法锁定全局状态来存储进程引用");
    }

    // 在后台任务中处理sidecar输出
    let app_handle = app.clone();
    info!("🔄 启动后台任务监听 Python sidecar 输出...");
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    info!("[Python Sidecar] stdout: {}", line.trim());

                    // 可以选择性地发送事件到前端
                    if let Err(e) = app_handle.emit("python-sidecar-output", line.trim()) {
                        error!("Failed to emit python sidecar output: {}", e);
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    error!("[Python Sidecar] stderr: {}", line.trim());

                    if let Err(e) = app_handle.emit("python-sidecar-error", line.trim()) {
                        error!("Failed to emit python sidecar error: {}", e);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    warn!(
                        "[Python Sidecar] Process terminated with code: {:?}",
                        payload.code
                    );

                    // 清理状态中的进程引用
                    let state: State<SidecarState> = app_handle.state();
                    if let Ok(mut child_guard) = state.child.lock() {
                        *child_guard = None;
                    }

                    if let Err(e) = app_handle.emit("python-sidecar-terminated", payload) {
                        error!("Failed to emit python sidecar termination: {}", e);
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        let version = &update.version;
        let body = update.body.as_deref().unwrap_or("无更新说明。");

        info!("发现新版本: {}，正在后台静默下载...", version);

        // 第一步：静默下载
        let mut downloaded = 0;
        let bytes = update
            .download(
                |chunk_length, content_length| {
                    downloaded += chunk_length;
                    info!("下载进度: {} / {:?}", downloaded, content_length);
                },
                || {
                    info!("下载完成！");
                },
            )
            .await?;

        info!("新版本下载完成！准备提示用户安装...");

        // 第二步：下载完成后提示用户
        let should_install = app
            .dialog()
            .message(format!(
                "新版本 {} 已下载完成！\n\n更新日志:\n{}\n\n是否立即安装并重启应用？",
                version, body
            ))
            .title(format!("可更新至版本 {}", version))
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::YesNo)
            .blocking_show();

        if should_install {
            info!("用户同意安装，正在开始安装更新...");

            // 第三步：用户确认后立即安装
            update.install(bytes)?;

            info!("更新安装完成，应用即将重启...");
            app.restart();
        } else {
            info!("用户取消安装，更新已下载但未安装。");
        }
    } else {
        info!("当前已是最新版本。");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                // 设置日志级别
                .level(log::LevelFilter::Debug)
                // 配置多个目标：终端输出 + 持久化到文件
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                // 设置最大文件大小 (5MB)
                .max_file_size(5_000_000)
                // 使用本地时区
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                // 自定义格式
                .format(|out, message, record| {
                    out.finish(format_args!(
                        "[{}][{}][{}:{}] {}",
                        Local::now().format("%Y-%m-%d %H:%M:%S"),
                        record.level(),
                        record.target(),
                        record.line().unwrap_or(0),
                        message
                    ))
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .manage(SidecarState::default())
        .setup(|app| {
            info!("🚀 启动 My Universe 应用...");
            info!("🔧 设置应用状态管理和插件...");
            let app_handle = app.handle().clone();

            info!("正在启动Python后台服务...");

            // 在setup中启动Python sidecar作为后台服务
            tauri::async_runtime::spawn({
                let app_handle = app_handle.clone();
                async move {
                    match start_python_service(app_handle).await {
                        Ok(_) => {
                            info!("Python后台服务启动成功");
                        }
                        Err(e) => {
                            error!("启动Python后台服务失败: {}", e);
                        }
                    }
                }
            });

            tauri::async_runtime::spawn(async move {
                update(app_handle).await.unwrap();
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Ok(mut child_guard) = window.state::<SidecarState>().child.lock() {
                    if let Some(child) = child_guard.take() {
                        info!("正在关闭 Python sidecar，pid: {}", child.pid());

                        #[cfg(windows)]
                        {
                            force_kill(child.pid());
                            info!("Windows: 已强制终止 Python sidecar 进程");
                        }

                        #[cfg(not(windows))]
                        {
                            if let Err(e) = child.kill() {
                                error!("关闭 Python sidecar 失败: {}", e);
                            } else {
                                info!("Python sidecar 已关闭");
                            }
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
