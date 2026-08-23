import React, { useRef, useEffect } from 'react';
import { MessageSquare, Paperclip, Camera as CameraIcon, Send as PaperAirplaneIcon, X as CloseIcon } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import type { Attachment } from '../../types';
import type { ActiveChannel } from './ChatList';

interface ChatRoomProps {
    messages: any[];
    isLoading: boolean;
    activeChannel: ActiveChannel;
    studentName: string;
    input: string;
    setInput: (val: string) => void;
    attachments: Attachment[];
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    onSendMessage: (e: React.FormEvent) => void;
    onCapturePhoto: () => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isSending?: boolean;
}

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const formatDateSeparator = (date: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(date, today)) return 'Hoy';
    if (isSameDay(date, yesterday)) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

const RenderAttachments: React.FC<{ attachments?: Attachment[] }> = ({ attachments }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
        <div className="mt-2 space-y-2">
            {attachments.map((att, idx) => {
                const isImage = att.type.startsWith('image/');
                if (isImage) {
                    return (
                        <div key={idx} className="relative group max-w-xs rounded-lg overflow-hidden border dark:border-slate-600 bg-black/5 mt-1.5 font-sans shadow-sm">
                            <img src={att.url} alt={att.name} referrerPolicy="no-referrer" className="max-h-48 object-contain w-full" />
                            <a href={att.url} download={att.name} className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center shadow-md border border-white/20" title="Descargar">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                            </a>
                        </div>
                    );
                }
                const sizeStr = att.size ? att.size > 1024 * 1024 ? `${(att.size / (1024 * 1024)).toFixed(1)} MB` : `${(att.size / 1024).toFixed(0)} KB` : '';
                return (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-slate-100/95 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 max-w-sm mt-1.5 shadow-sm text-slate-800 dark:text-slate-200">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                        </div>
                        <div className="flex-1 min-w-0 font-sans">
                            <p className="text-xs font-semibold truncate pr-2 text-left">{att.name}</p>
                            {sizeStr && <p className="text-[10px] text-slate-500 dark:text-slate-400 text-left">{sizeStr}</p>}
                        </div>
                        <a href={att.url} download={att.name} className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg transition-colors flex items-center justify-center flex-shrink-0" title="Descargar">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        </a>
                    </div>
                );
            })}
        </div>
    );
};

const MessageBubble: React.FC<{ message: any, studentName: string, activeChannel: ActiveChannel }> = ({ message, studentName, activeChannel }) => {
    const isMe = message.senderRole === 'student' || (!message.senderRole && !message.senderName);
    const date = new Date(message.timestamp?.toMillis ? message.timestamp.toMillis() : (message.timestamp || Date.now()));
    
    const senderName = isMe 
        ? 'Yo' 
        : message.senderName || (
            activeChannel.type === 'teacher' 
                ? `Prof. ${activeChannel.teacher?.name || 'Profesor'}`
                : 'Soporte Técnico'
        );

    return (
        <div className={`flex w-full mb-4 font-sans ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {senderName}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-[15px] leading-relaxed break-words relative group ${
                    isMe
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                }`}>
                    {message.text && (
                        <div className="whitespace-pre-wrap text-left" style={{ wordBreak: 'break-word' }}>
                            {message.text}
                        </div>
                    )}
                    <RenderAttachments attachments={message.attachments} />
                </div>
            </div>
        </div>
    );
};

export const ChatRoom: React.FC<ChatRoomProps> = ({
    messages, isLoading, activeChannel, studentName, input, setInput,
    attachments, setAttachments, onSendMessage, onCapturePhoto, onFileChange, isSending
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${e.target.scrollHeight}px`;
        }
    };

    const groupedMessages = React.useMemo(() => {
        if (!messages) return [];
        const groups: { date: string, messages: any[] }[] = [];
        messages.forEach(msg => {
            const msgDate = new Date(msg.timestamp?.toMillis ? msg.timestamp.toMillis() : (msg.timestamp || Date.now()));
            const formattedDate = formatDateSeparator(msgDate);
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.date === formattedDate) {
                lastGroup.messages.push({ ...msg, timestamp: msgDate.getTime() });
            } else {
                groups.push({ date: formattedDate, messages: [{ ...msg, timestamp: msgDate.getTime() }] });
            }
        });
        return groups;
    }, [messages]);

    return (
        <div className="flex flex-col flex-1 overflow-hidden relative font-sans min-h-0">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gray-50 dark:bg-slate-900 min-h-0">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full"><Spinner /></div>
                ) : groupedMessages.length > 0 ? (
                    groupedMessages.map((group, groupIndex) => (
                        <React.Fragment key={groupIndex}>
                            <div className="text-center my-4 select-none">
                                <span className="px-2 py-1 bg-gray-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-full shadow-sm">
                                    {group.date}
                                </span>
                            </div>
                            {group.messages.map(msg => (
                                <MessageBubble key={msg.id} message={msg} studentName={studentName} activeChannel={activeChannel} />
                            ))}
                        </React.Fragment>
                    ))
                ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 h-full flex flex-col justify-center items-center p-4">
                        <MessageSquare className="w-16 h-16 text-gray-300 dark:text-slate-600" />
                        <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300 select-none">
                            {activeChannel.type === 'teacher'
                                ? `Inicia tu conversación con Prof. ${activeChannel.teacher?.name || 'Profesor'}`
                                : 'Canal de Soporte Técnico'}
                        </p>
                        <p className="text-xs select-none">
                            {activeChannel.type === 'teacher'
                                ? 'Escribe directamente a tu profesor para consultas 1:1.'
                                : 'Recibe ayuda técnica con accesos y la plataforma.'}
                        </p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            
            <form onSubmit={onSendMessage} className="p-3 pb-5 sm:p-3 md:p-4 bg-white dark:bg-slate-800 border-t dark:border-slate-700 flex-shrink-0 w-full max-w-full box-border overflow-hidden">
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 dark:bg-slate-900 rounded-lg border dark:border-slate-700 animate-fade-in">
                        {attachments.map((att, index) => (
                            <div key={index} className="relative flex items-center gap-2 p-1.5 pr-8 bg-white dark:bg-slate-800 rounded-md border dark:border-slate-750 shadow-sm max-w-[200px]">
                                {att.type.startsWith('image/') ? (
                                    <img src={att.url} alt="Previsualizar" className="w-8 h-8 rounded object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                                        <Paperclip className="w-4 h-4" />
                                    </div>
                                )}
                                <span className="text-[10px] font-semibold truncate text-slate-700 dark:text-slate-300" title={att.name}>{att.name}</span>
                                <button
                                    type="button"
                                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== index))}
                                    className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <CloseIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-end gap-2 p-2 border rounded-xl bg-gray-50 dark:bg-slate-700 focus-within:ring-2 focus-within:ring-primary transition-shadow dark:border-slate-600 max-h-[200px] w-full min-w-0 box-border">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
                        title="Adjuntar imágenes o archivos"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <button
                        type="button"
                        onClick={onCapturePhoto}
                        className="p-2 text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-gray-200/50 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
                        title="Hacer foto directamente"
                    >
                        <CameraIcon className="w-5 h-5" />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={onFileChange} multiple className="hidden" />
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSendMessage(e);
                            }
                        }}
                        placeholder={
                            activeChannel.type === 'teacher'
                                ? `Escribir mensaje privado a Prof. ${activeChannel.teacher?.name || 'Profesor'}...`
                                : 'Escribir a Soporte Técnico...'
                        }
                        rows={1}
                        className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 resize-none p-1 text-slate-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 max-h-32 overflow-y-auto"
                    />
                    <button
                        type="submit"
                        disabled={(!input.trim() && attachments.length === 0) || isSending}
                        className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
                        aria-label="Enviar mensaje"
                    >
                        {isSending ? <Spinner /> : <PaperAirplaneIcon className="w-5 h-5" />}
                    </button>
                </div>
            </form>
        </div>
    );
};
