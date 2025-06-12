import * as React from "react";
import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  type VirtuosoMessageListMethods,
  type VirtuosoMessageListProps,
} from "@virtuoso.dev/message-list";
import OpenAI from "openai";
import delay from "delay";
import { v4 as uuidv4 } from "uuid";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { useState } from "react";
import { useUserStore } from "../stores/userStore";

interface Message {
  key: string;
  text: string;
  user: "me" | "other";
}

function createMessage(user: Message["user"], text: string): Message {
  return {
    user,
    key: uuidv4(),
    text,
  };
}

const ItemContent: VirtuosoMessageListProps<Message, null>["ItemContent"] = ({
  data,
}) => {
  const ownMessage = data.user === "me";
  return (
    <div className="p-2 pb-8 flex">
      <div
        className={`max-w-[80%] rounded-2xl p-4 ${
          ownMessage
            ? "ml-auto bg-blue-500 text-white"
            : "bg-gray-100 text-gray-900 border border-gray-200"
        }`}
      >
        {data.text}
      </div>
    </div>
  );
};

export default function ChatBox() {
  const virtuoso = React.useRef<VirtuosoMessageListMethods<Message>>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [, setIsStreaming] = React.useState(false);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 用于管理当前的请求控制器
  const currentControllerRef = React.useRef<AbortController | null>(null);

  // 从 store 获取 API key 和相关方法
  const { openaiApiKey, setOpenaiApiKey, hasValidApiKey } = useUserStore();

  // 创建OpenAI客户端
  const openai = React.useMemo(() => {
    if (!hasValidApiKey()) {
      return null;
    }

    return new OpenAI({
      apiKey: openaiApiKey,
      dangerouslyAllowBrowser: true,
    });
  }, [openaiApiKey, hasValidApiKey]);

  const handleSendMessage = async () => {
    const inputValue = inputRef.current?.value?.trim();
    if (!inputValue) return;

    // 检查是否有有效的 API key
    if (!hasValidApiKey()) {
      // 发送用户消息
      const myMessage = createMessage("me", inputValue);
      virtuoso.current?.data.append(
        [myMessage],
        ({ scrollInProgress, atBottom }) => {
          return {
            index: "LAST",
            align: "start",
            behavior: atBottom || scrollInProgress ? "smooth" : "auto",
          };
        }
      );

      // 清空输入框
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }

      // 提示用户设置 API key
      const errorMessage = createMessage(
        "other",
        "请先设置您的 OpenAI API Key 才能开始对话。点击右上角的设置按钮进行配置。"
      );
      virtuoso.current?.data.append([errorMessage]);
      return;
    }

    // 如果有正在进行的请求，先取消它
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
      console.log("上一次请求已取消");
    }

    const userMessage = inputValue;

    // 清空输入框但保持焦点
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }

    setIsStreaming(true);

    // 发送用户消息
    const myMessage = createMessage("me", userMessage);
    virtuoso.current?.data.append(
      [myMessage],
      ({ scrollInProgress, atBottom }) => {
        return {
          index: "LAST",
          align: "start",
          behavior: atBottom || scrollInProgress ? "smooth" : "auto",
        };
      }
    );

    await delay(1000);

    // 创建新的AbortController
    const controller = new AbortController();
    currentControllerRef.current = controller;

    try {
      // 创建AI回复消息
      const botMessage = createMessage("other", "");
      virtuoso.current?.data.append([botMessage]);

      // 使用OpenAI stream获取AI回复，并传入AbortController的signal
      const stream = await openai!.chat.completions.create(
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "你是一个友好的AI助手，请用中文回答用户的问题。",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
          stream: true,
        },
        {
          signal: controller.signal, // 传入AbortController的signal
        }
      );

      // 处理流式响应
      for await (const chunk of stream) {
        // 检查是否已被取消
        if (controller.signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          // 更新机器人消息
          virtuoso.current?.data.map((message) => {
            return message.key === botMessage.key
              ? { ...message, text: message.text + content }
              : message;
          }, "smooth");
        }
      }
    } catch (error) {
      console.error("AI回复错误:", error);
      // 显示错误消息
      const errorMessage = createMessage(
        "other",
        "抱歉，我现在无法继续回复。请稍后再试。"
      );
      virtuoso.current?.data.append([errorMessage]);
    } finally {
      setIsStreaming(false);
      currentControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 点击外部关闭设置面板
  const handleOutsideClick = () => {
    if (showSettings) {
      setShowSettings(false);
    }
  };

  return (
    <div
      className="h-full w-full flex flex-col text-sm border border-gray-300 rounded-lg overflow-hidden bg-white shadow-lg relative"
      onClick={handleOutsideClick}
    >
      {/* 设置按钮 */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
          className="p-2 rounded-full bg-white shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200"
          title="设置"
        >
          <svg
            className="w-4 h-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div
          className="absolute top-16 right-4 z-20 bg-white p-4 rounded-lg shadow-xl border border-gray-200 w-64"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">设置</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="输入您的 OpenAI API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  您的 API Key 将安全地存储在本地浏览器中
                </p>
              </div>
              <div className="flex justify-between items-center">
                <span
                  className={`text-sm ${
                    hasValidApiKey() ? "text-green-600" : "text-red-600"
                  }`}
                >
                  状态: {hasValidApiKey() ? "已配置" : "未配置"}
                </span>
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors duration-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <VirtuosoMessageListLicense
        licenseKey={import.meta.env.VITE_VML_LICENSE || ""}
      >
        <SimpleBar
          className="flex-1 min-h-0"
          scrollableNodeProps={{ ref: setScrollParent }}
        >
          {scrollParent && (
            <VirtuosoMessageList<Message, null>
              ref={virtuoso}
              customScrollParent={scrollParent}
              computeItemKey={({ data }) => data.key}
              ItemContent={ItemContent}
              // 不能在这里列表处设置 padding，需要到 Item 里面实现
              className="h-full"
            />
          )}
        </SimpleBar>
      </VirtuosoMessageListLicense>
      <div className="p-4 border-t border-gray-200 flex gap-2 bg-gray-50 relative">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={handleKeyPress}
          placeholder="输入消息并按回车键发送..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={handleSendMessage}
          className={`px-4 py-2 rounded-md font-medium transition-colors duration-200 bg-blue-500 hover:bg-blue-600 text-white cursor-pointer`}
        >
          发送
        </button>
      </div>
    </div>
  );
}
