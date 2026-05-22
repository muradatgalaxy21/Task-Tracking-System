"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import UserAvatar from "@/components/common/UserAvatar";
import {
  Send,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  X,
  Loader2,
  Users,
  MessageSquare,
} from "lucide-react";

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface ChatMessage {
  id: string;
  content: string;
  attachments: string; // JSON array of Attachment
  created_at: string;
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    image: string | null;
  };
}

/**
 * ChatPage Component
 * 1. Maintain chat message state and local attachment attachments
 * 2. Setup short-polling for messages retrieval using ?since= timestamp
 * 3. Handle attachment uploads by calling /api/upload
 * 4. Submit messages to /api/chat database
 */
export default function ChatPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageTimeRef = useRef<string | null>(null);

  // 1. Initial Load: Fetch last 100 messages for this workspace
  useEffect(() => {
    if (!activeWorkspace?.id) return;

    const loadMessages = async () => {
      setLoadingInitial(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat?workspaceId=${activeWorkspace.id}`);
        if (!res.ok) {
          throw new Error("Failed to load messages");
        }
        const data: ChatMessage[] = await res.json();
        setMessages(data);

        // Record the timestamp of the latest message for subsequent polling queries
        if (data.length > 0) {
          lastMessageTimeRef.current = data[data.length - 1].created_at;
        } else {
          lastMessageTimeRef.current = null;
        }

        // Trigger scroll to bottom on initial load
        setTimeout(scrollToBottom, 100);
      } catch (err: any) {
        setError(err.message || "Failed to load chat history.");
      } finally {
        setLoadingInitial(false);
      }
    };

    loadMessages();
  }, [activeWorkspace?.id]);

  // 2. Setup short-polling (every 3 seconds) for incremental fetches
  useEffect(() => {
    if (!activeWorkspace?.id) return;

    const pollInterval = setInterval(async () => {
      try {
        let url = `/api/chat?workspaceId=${activeWorkspace.id}`;
        if (lastMessageTimeRef.current) {
          url += `&since=${encodeURIComponent(lastMessageTimeRef.current)}`;
        }

        const res = await fetch(url);
        if (!res.ok) return;

        const newMsgs: ChatMessage[] = await res.json();
        if (newMsgs.length > 0) {
          // Check scroll position to determine if we should auto-scroll
          const container = scrollContainerRef.current;
          const shouldAutoScroll = container
            ? container.scrollHeight - container.scrollTop - container.clientHeight < 150
            : true;

          setMessages((prev) => {
            // Avoid duplicate messages if overlap occurs
            const existingIds = new Set(prev.map((m) => m.id));
            const filteredNew = newMsgs.filter((m) => !existingIds.has(m.id));
            const updated = [...prev, ...filteredNew];

            // Update the last message time ref
            if (updated.length > 0) {
              lastMessageTimeRef.current = updated[updated.length - 1].created_at;
            }
            return updated;
          });

          if (shouldAutoScroll) {
            setTimeout(scrollToBottom, 50);
          }
        }
      } catch (err) {
        console.error("Incremental chat poll failed:", err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [activeWorkspace?.id]);

  // 3. Scroll to the bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 4. File uploads handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Post the multipart form file data to the local upload API route.
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      // 2. Fetch the response body as text once to avoid stream consumption issues.
      const responseText = await res.text();

      // 3. Process error responses using parsed JSON error field or the raw text payload.
      if (!res.ok) {
        let errMsg = "File upload failed";
        try {
          const uploadData = JSON.parse(responseText);
          errMsg = uploadData.error || errMsg;
        } catch {
          errMsg = responseText || errMsg;
        }
        throw new Error(errMsg);
      }

      // 4. Parse the successful upload metadata from the response text.
      const data = JSON.parse(responseText);
      setAttachedFiles((prev) => [
        ...prev,
        {
          name: data.name || file.name,
          url: data.url,
          type: file.type || "application/octet-stream",
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to upload attachment.");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 5. Send message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (sending) return;

    const trimmedText = inputText.trim();
    if (!trimmedText && attachedFiles.length === 0) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          content: trimmedText,
          attachments: attachedFiles,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send message");
      }

      const newMessage: ChatMessage = await res.json();

      // Append newly sent message to current list
      setMessages((prev) => {
        const updated = [...prev, newMessage];
        lastMessageTimeRef.current = newMessage.created_at;
        return updated;
      });

      setInputText("");
      setAttachedFiles([]);
      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format message datetime to a user friendly label
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Group messages helper to detect and render date dividers
  const renderMessageGroups = () => {
    const groups: React.ReactNode[] = [];
    let lastDateLabel = "";

    messages.forEach((msg, idx) => {
      const dateObj = new Date(msg.created_at);
      const dateLabel = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      // Insert date divider if date changes
      if (dateLabel !== lastDateLabel) {
        groups.push(
          <div key={`date-${msg.id}`} className="flex items-center justify-center my-6">
            <div className="border-t border-neutral-100 flex-grow" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100 mx-4">
              {dateLabel}
            </span>
            <div className="border-t border-neutral-100 flex-grow" />
          </div>
        );
        lastDateLabel = dateLabel;
      }

      const isMe = msg.user.id === user?.id;

      // Parse attachment list
      let parsedAttachments: Attachment[] = [];
      try {
        parsedAttachments = msg.attachments ? JSON.parse(msg.attachments) : [];
      } catch (e) {
        parsedAttachments = [];
      }

      groups.push(
        <div
          key={msg.id}
          className={`flex gap-3 max-w-[85%] ${
            isMe ? "ml-auto flex-row-reverse" : "mr-auto"
          } mb-4 group`}
        >
          {/* Sender Avatar */}
          <UserAvatar
            fullName={msg.user.full_name}
            image={msg.user.image}
            size={32}
            className="rounded-full shadow-sm border border-neutral-200 mt-0.5 shrink-0"
          />

          <div className="space-y-1">
            {/* Sender Header */}
            {!isMe && (
              <span className="text-[11px] font-semibold text-neutral-500 ml-1">
                {msg.user.full_name || "Workspace Member"}
              </span>
            )}

            {/* Bubble */}
            <div
              className={`p-3.5 rounded-2xl text-sm leading-relaxed border ${
                isMe
                  ? "bg-[#e06b6b] text-white border-[#df5f5f] rounded-tr-none shadow-sm shadow-[#e06b6b]/10"
                  : "bg-white text-neutral-800 border-neutral-200/70 rounded-tl-none shadow-sm"
              }`}
            >
              {/* Message Content */}
              {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

              {/* Attachments List inside Bubble */}
              {parsedAttachments.length > 0 && (
                <div className={`mt-2 space-y-2 ${msg.content ? "pt-2 border-t border-white/20" : ""}`}>
                  {parsedAttachments.map((att, attIdx) => {
                    const isImg = att.type.startsWith("image/");
                    const isPdf = att.type === "application/pdf";

                    if (isImg) {
                      return (
                        <div key={attIdx} className="relative rounded-lg overflow-hidden border border-white/10 group/img">
                          <img
                            src={att.url}
                            alt={att.name}
                            className="max-h-60 object-contain w-full bg-neutral-900/5 cursor-pointer rounded-lg"
                            onClick={() => window.open(att.url, "_blank")}
                          />
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-2 right-2 text-[10px] font-semibold px-2.5 py-1 rounded bg-black/60 text-white backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1.5"
                          >
                            <ImageIcon size={10} />
                            View Full
                          </a>
                        </div>
                      );
                    }

                    return (
                      <a
                        key={attIdx}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          isMe
                            ? "bg-white/10 border-white/10 hover:bg-white/15 text-white"
                            : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {isPdf ? <FileText size={14} className="shrink-0" /> : <LinkIcon size={14} className="shrink-0" />}
                        <span className="truncate flex-1">{att.name}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Timestamp */}
            <div className={`text-[9px] text-neutral-400 px-1 ${isMe ? "text-right" : "text-left"}`}>
              {formatTime(msg.created_at)}
            </div>
          </div>
        </div>
      );
    });

    return groups;
  };

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-50/50">
        <div className="max-w-md text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-warm-400/10 flex items-center justify-center text-warm-400 mx-auto border border-warm-400/20">
            <MessageSquare size={22} />
          </div>
          <h2 className="text-sm font-semibold text-neutral-700">Select a Workspace</h2>
          <p className="text-xs text-neutral-400">
            Select an active workspace from the sidebar menu to access its team group chat channel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-50/50 relative overflow-hidden rounded-r-xl border-l border-neutral-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex items-center justify-between shadow-sm shrink-0">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
            <MessageSquare size={16} className="text-neutral-500" />
            Workspace Chat
          </h1>
          <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
            Group channel for all members of the {activeWorkspace.name} workspace
          </p>
        </div>
        <div className="flex items-center gap-1 bg-neutral-100 px-2.5 py-1 rounded-full text-neutral-600 text-[10px] font-semibold">
          <Users size={12} />
          <span>Team Channel</span>
        </div>
      </div>

      {/* Main Messages Feed */}
      <div
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto px-6 py-4 bg-neutral-50/30"
      >
        {loadingInitial ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-medium">Fetching chat history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-neutral-400/80">
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center border border-neutral-200">
              <MessageSquare size={16} />
            </div>
            <span className="text-xs font-semibold">No messages yet</span>
            <span className="text-[10px] text-neutral-400 text-center max-w-[220px]">
              Type a message below to start chatting with your workspace teammates.
            </span>
          </div>
        ) : (
          <>
            {renderMessageGroups()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Footer Area: Input Composer + Attachments Preview */}
      <div className="p-4 bg-white border-t border-neutral-200 shrink-0">
        {/* Attachments Preview Row */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-neutral-100">
            {attachedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 text-xs border border-neutral-200 max-w-[200px]"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon size={12} className="text-neutral-500 shrink-0" />
                ) : (
                  <FileText size={12} className="text-neutral-500 shrink-0" />
                )}
                <span className="truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="p-0.5 rounded-full hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Control Composer Form */}
        <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
          <div className="flex-1 relative flex items-center border border-neutral-200 hover:border-neutral-300 rounded-xl bg-neutral-50 focus-within:bg-white focus-within:border-warm-400 transition-all px-3.5 py-2">
            {/* Attachment Button */}
            <button
              type="button"
              disabled={uploadingFile || sending}
              onClick={() => document.getElementById("chat-file-input")?.click()}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              title="Attach photo or document"
            >
              {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip size={16} />}
            </button>
            <input
              id="chat-file-input"
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Input Text Area */}
            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message workspace..."
              className="flex-grow bg-transparent border-0 focus:ring-0 focus:outline-none text-sm text-neutral-800 placeholder-neutral-400 mx-2.5 resize-none py-1 min-h-[24px]"
              disabled={sending}
            />
          </div>

          {/* Send Trigger Button */}
          <button
            type="submit"
            disabled={sending || (!inputText.trim() && attachedFiles.length === 0)}
            className="p-3 rounded-xl bg-[#e06b6b] text-white hover:bg-[#df5f5f] transition-all disabled:opacity-40 shrink-0 shadow-sm cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={15} />}
          </button>
        </form>

        {/* Error Notice display */}
        {error && (
          <div className="mt-2 text-[10px] text-red-500 font-semibold px-2 flex items-center gap-1.5 animate-pulse">
            <X size={10} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
