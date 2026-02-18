import { useEffect, useRef } from 'react';
import type { SessionMessage } from '../services/api-client.js';

function MessageBubble({ message }: { message: SessionMessage }) {
  const isUser = message.role === 'user';

  const toolUses = message.events?.filter((e) => e.type === 'tool_use') ?? [];
  const toolResults = message.events?.filter((e) => e.type === 'tool_result') ?? [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? 'bg-blue-900/40 border border-blue-800 text-blue-100'
            : 'bg-gray-800 border border-gray-700 text-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-400">
            {isUser ? 'You' : 'Agent'}
          </span>
          <span className="text-xs text-gray-600">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {toolUses.length > 0 && (
          <div className="mt-2 space-y-1">
            {toolUses.map((event, i) => {
              const data = event.data as { toolName: string };
              const result = toolResults.find(
                (r) => (r.data as { toolId: string }).toolId === (event.data as { toolId: string }).toolId,
              );
              const resultData = result?.data as { isError?: boolean } | undefined;
              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-900/50 px-2 py-1 text-xs"
                >
                  <span className="text-gray-500">Tool:</span>
                  <span className="font-mono text-gray-300">{data.toolName}</span>
                  {resultData && (
                    <span className={resultData.isError ? 'text-red-400' : 'text-green-400'}>
                      {resultData.isError ? 'failed' : 'ok'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SessionOutput({
  messages,
  streamOutput,
}: {
  messages: SessionMessage[];
  streamOutput: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length, streamOutput.length]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto space-y-3 p-4"
    >
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {streamOutput.length > 0 && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
          <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
            {streamOutput.join('')}
          </pre>
        </div>
      )}

      {messages.length === 0 && streamOutput.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-gray-600">
          No messages yet
        </div>
      )}
    </div>
  );
}
