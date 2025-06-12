import subprocess
import sys
import os
import platform
import re

def build_executable():
    """使用 PyInstaller 打包 Python 应用为可执行文件"""
    
    # 使用 uv 安装依赖
    subprocess.run(["uv", "sync"], check=True)
    subprocess.run(["uv", "add", "--dev", "pyinstaller"], check=True)
    
    # 获取平台扩展名
    ext = ".exe" if platform.system() == "Windows" else ""
    
    # 从环境变量获取目标平台，如果没有则使用当前平台
    target_triple = os.environ.get('TAURI_TARGET_TRIPLE')
    if not target_triple:
        # 使用 rustc 获取目标三元组（官网方法）
        try:
            rust_info = subprocess.check_output(['rustc', '-vV'], text=True)
            target_match = re.search(r'host: (\S+)', rust_info)
            if not target_match:
                raise RuntimeError('Failed to determine platform target triple')
            target_triple = target_match.group(1)
        except subprocess.CalledProcessError:
            # 如果 rustc 不可用，使用平台默认值
            system = platform.system().lower()
            if system == 'windows':
                target_triple = 'x86_64-pc-windows-msvc'
            elif system == 'darwin':
                # 检测是否为 Apple Silicon
                if platform.machine() == 'arm64':
                    target_triple = 'aarch64-apple-darwin'
                else:
                    target_triple = 'x86_64-apple-darwin'
            elif system == 'linux':
                target_triple = 'x86_64-unknown-linux-gnu'
            else:
                raise RuntimeError(f'Unsupported platform: {system}')
    
    # 使用 uv 运行 PyInstaller 打包命令
    build_cmd = [
        "uv", "run", "pyinstaller", 
        "--onefile", 
        "--name", "python-sidecar",
        "--distpath", "../src-tauri/binaries",
        "main.py"
    ]
    
    subprocess.run(build_cmd, check=True)
    
    # 重命名文件以符合 Tauri 规范（官网方法）
    old_name = f"../src-tauri/binaries/python-sidecar{ext}"
    new_name = f"../src-tauri/binaries/python-sidecar-{target_triple}{ext}"
    
    # 如果目标文件已存在，先删除它
    if os.path.exists(new_name):
        os.remove(new_name)
    
    # 检查源文件是否存在
    if not os.path.exists(old_name):
        raise RuntimeError(f"Built executable not found: {old_name}")
    
    os.rename(old_name, new_name)
    print(f"[SUCCESS] Python sidecar built: {new_name}")

if __name__ == "__main__":
    try:
        build_executable()
    except Exception as e:
        print(f"[ERROR] Failed to build Python sidecar: {e}")
        sys.exit(1)