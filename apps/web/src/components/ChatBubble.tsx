import React from 'react';
import { formatTimeInKolkata } from '../lib/date.js';
import { Check, CheckCheck } from 'lucide-react';

export type ChatRole = 'user' | 'assistant' | 'executive' | 'system';

export interface ChatBubbleProps {
  role: ChatRole;
  content: React.ReactNode;
  timestamp?: string | Date;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  senderName?: string;
  avatar?: React.ReactNode;
  className?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  role,
  content,
  timestamp,
  status = 'delivered',
  senderName,
  avatar,
  className = '',
}) => {
  const formattedTime = timestamp ? formatTimeInKolkata(timestamp) : null;

  if (role === 'system') {
    return (
      <div className={`flex justify-center my-3 ${className}`}>
        <div className="px-3 py-1.5 rounded-full border border-hairline bg-surface/60 text-xs text-muted text-center max-w-sm">
          {content}
        </div>
      </div>
    );
  }

  const isUser = role === 'user';

  return (
    <div className={`flex flex-col gap-1 my-2 ${isUser ? 'items-end' : 'items-start'} ${className}`}>
      {senderName && (
        <span className="text-[11px] font-medium text-muted uppercase tracking-wider px-1">
          {senderName}
        </span>
      )}
      <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && avatar && (
          <div className="w-7 h-7 rounded-full bg-accent-soft text-accent border border-accent/20 flex items-center justify-center text-xs font-semibold flex-shrink-0 mb-0.5">
            {avatar}
          </div>
        )}
        <div
          className={`p-4 rounded-xl text-sm leading-relaxed ${
            isUser
              ? 'bg-accent text-white rounded-br-xs shadow-subtle'
              : 'bg-surface text-ink border border-hairline rounded-bl-xs shadow-card'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{content}</div>
          <div
            className={`mt-1.5 flex items-center justify-end gap-1.5 text-[11px] select-none ${
              isUser ? 'text-white/70' : 'text-muted'
            }`}
          >
            {formattedTime && <span>{formattedTime}</span>}
            {isUser && status && (
              <span className="inline-flex items-center">
                {status === 'read' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-white/70" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
