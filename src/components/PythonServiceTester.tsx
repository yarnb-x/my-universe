import { useState, useEffect } from "react";
import { fetch } from "@tauri-apps/plugin-http";

export interface PythonServiceStatus {
  status: "starting" | "running" | "error" | "stopped";
  logs: string[];
}

export interface PythonServiceTesterProps {
  onStatusChange?: (status: PythonServiceStatus) => void;
  onTestResult?: (success: boolean, message: string) => void;
  onMessageResponse?: (response: string) => void;
  className?: string;
  showLogs?: boolean;
  showTestButton?: boolean;
}

export default function PythonServiceTester({
  onStatusChange,
  onTestResult,
  className = "",
  showLogs = true,
  showTestButton = true,
}: PythonServiceTesterProps) {
  const [serviceStatus, setServiceStatus] = useState<
    "starting" | "running" | "error" | "stopped"
  >("starting");
  const [serviceLogs, setServiceLogs] = useState<string[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // 检测Python服务状态
  useEffect(() => {
    const checkPythonService = async () => {
      try {
        const response = await fetch("http://localhost:8000/health", {
          method: "GET",
        });

        if (response.ok) {
          setServiceStatus("running");
          const data = await response.json();
          const newLog = `✅ Python服务运行正常: ${data.status || "OK"}`;
          setServiceLogs((prev) => [...prev.slice(-9), newLog]);
        } else {
          setServiceStatus("error");
          const newLog = `❌ Python服务响应错误: ${response.status}`;
          setServiceLogs((prev) => [...prev.slice(-9), newLog]);
        }
      } catch (error) {
        setServiceStatus("error");
        const newLog = `❌ 无法连接Python服务: ${
          error instanceof Error ? error.message : String(error)
        }`;
        setServiceLogs((prev) => [...prev.slice(-9), newLog]);
        console.error("Python service check failed:", error);
      }
    };

    // 初始检查
    setTimeout(checkPythonService, 2000);

    // 定期检查
    const interval = setInterval(checkPythonService, 10000);

    return () => clearInterval(interval);
  }, []);

  // 状态变化时通知父组件
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange({
        status: serviceStatus,
        logs: serviceLogs,
      });
    }
  }, [serviceStatus, serviceLogs, onStatusChange]);

  // 测试Python服务连接
  const testPythonService = async () => {
    if (isTestingConnection) return;

    setIsTestingConnection(true);

    try {
      const response = await fetch("http://localhost:8000/hello/测试连接", {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        const successMessage = `✅ Python服务连接成功！响应: ${
          data.message || JSON.stringify(data)
        }`;
        setServiceLogs((prev) => [...prev.slice(-9), successMessage]);

        if (onTestResult) {
          onTestResult(true, successMessage);
        }
      } else {
        const errorText = await response.text();
        const errorMessage = `❌ Python服务响应错误 (${response.status}): ${errorText}`;
        setServiceLogs((prev) => [...prev.slice(-9), errorMessage]);

        if (onTestResult) {
          onTestResult(false, errorMessage);
        }
      }
    } catch (error) {
      const errorMessage = `❌ 连接Python服务失败: ${
        error instanceof Error ? error.message : String(error)
      }`;
      setServiceLogs((prev) => [...prev.slice(-9), errorMessage]);
      console.error("Python service test failed:", error);

      if (onTestResult) {
        onTestResult(false, errorMessage);
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className={`python-service-tester ${className}`}>
      {/* 服务状态指示器 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              serviceStatus === "running"
                ? "bg-green-500"
                : serviceStatus === "starting"
                ? "bg-yellow-500"
                : serviceStatus === "error"
                ? "bg-red-500"
                : "bg-gray-500"
            }`}
          ></div>
          <span className="text-xs text-gray-600">Python: {serviceStatus}</span>
        </div>

        {showTestButton && (
          <button
            onClick={testPythonService}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isTestingConnection
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
            disabled={isTestingConnection}
          >
            {isTestingConnection ? "测试中..." : "测试连接"}
          </button>
        )}
      </div>

      {/* 服务日志 */}
      {showLogs && serviceLogs.length > 0 && (
        <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded max-h-16 overflow-y-auto">
          {serviceLogs.slice(-2).map((log, index) => (
            <div key={index} className="truncate">
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 提供一个 Hook 用于在其他组件中使用 Python 服务
export function usePythonService() {
  const [serviceStatus, setServiceStatus] = useState<PythonServiceStatus>({
    status: "starting",
    logs: [],
  });

  const sendMessage = async (message: string): Promise<string> => {
    try {
      const response = await fetch(
        `http://localhost:8000/hello/${encodeURIComponent(message)}`,
        {
          method: "GET",
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.message || JSON.stringify(data);
      } else {
        throw new Error(`Python API error: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send to Python:", error);
      throw error;
    }
  };

  const testConnection = async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      const response = await fetch("http://localhost:8000/hello/测试连接", {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: `Python服务连接成功！响应: ${
            data.message || JSON.stringify(data)
          }`,
        };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          message: `Python服务响应错误 (${response.status}): ${errorText}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `连接Python服务失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  };

  return {
    serviceStatus,
    setServiceStatus,
    sendMessage,
    testConnection,
  };
}
