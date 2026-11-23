'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Room, RoomMember, ChatMessage, RoomRole } from '@/types/app';
import VoiceRoomPanel from './VoiceRoomPanel';
import {
  Send,
  Paperclip,
  Smile,
  Shield,
  Crown,
  UserMinus,
  Users,
  Hash,
  Lock,
  Copy,
  Check,
  Volume2,
  PhoneOff,
  FileText,
} from 'lucide-react';

interface Props {
  currentUser: Profile;
  room: Room;
  activeVoiceRoomId: string | null;
  onJoinVoiceRoom: (roomId: string) => void;
  onLeaveVoiceRoom: () => void;
}

const QUICK_EMOJIS = ['👍', '😂', '🔥', '❤️', '👏', '🎮', '🚀', '🤔', '🎉', '👀'];

export default function RoomChatAndMembers({
  currentUser,
  room,
  activeVoiceRoomId,
  onJoinVoiceRoom,
  onLeaveVoiceRoom,
}: Props) {
  const supabase = createClient();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const isInThisVoiceRoom = activeVoiceRoomId === room.id;

  const currentMemberRole: RoomRole =
    members.find((m) => m.user_id === currentUser.id)?.role ||
    (room.owner_id === currentUser.id ? 'owner' : 'member');

  const canManageMembers = currentMemberRole === 'owner';

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        room_id,
        user_id,
        content,
        file_url,
        file_name,
        file_type,
        is_edited,
        created_at,
        sender:profiles!messages_user_id_fkey(id, username, avatar_url, bio)
      `)
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const normalized: ChatMessage[] = data.map((row: any) => ({
        id: row.id,
        room_id: row.room_id,
        user_id: row.user_id,
        content: row.content,
        file_url: row.file_url,
        file_name: row.file_name,
        file_type: row.file_type,
        is_edited: row.is_edited,
        created_at: row.created_at,
        sender: Array.isArray(row.sender) ? row.sender[0] : row.sender,
      }));
      setMessages(normalized);
    }
  }, [room.id, supabase]);

  const loadMembers = useCallback(async () => {
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (!existingMember) {
      await supabase.from('room_members').insert({
        room_id: room.id,
        user_id: currentUser.id,
        role: room.owner_id === currentUser.id ? 'owner' : 'member',
      });
    }

    const { data, error } = await supabase
      .from('room_members')
      .select(`
        id,
        room_id,
        user_id,
        role,
        profile:profiles!room_members_user_id_fkey(id, username, avatar_url, bio)
      `)
      .eq('room_id', room.id);

    if (!error && data) {
      const normalized: RoomMember[] = data.map((row: any) => ({
        id: row.id,
        room_id: row.room_id,
        user_id: row.user_id,
        role: row.role,
        profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
      }));
      setMembers(normalized);
    }
  }, [room.id, room.owner_id, currentUser.id, supabase]);

  useEffect(() => {
    loadMessages();
    loadMembers();

    const msgChannel = supabase
      .channel(`messages-room-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    const memberChannel = supabase
      .channel(`members-room-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(memberChannel);
    };
  }, [room.id, loadMessages, loadMembers, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setChatError(null);
    const text = newMessage.trim();
    if (!text && !attachmentFile) return;

    setSending(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;

      if (attachmentFile) {
        const ext = attachmentFile.name.split('.').pop();
        const filePath = `rooms/${room.id}/${currentUser.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(filePath, attachmentFile);

        if (!upErr) {
          const { data: pub } = supabase.storage
            .from('attachments')
            .getPublicUrl(filePath);
          fileUrl = pub.publicUrl;
          fileName = attachmentFile.name;
          fileType = attachmentFile.type || 'file';
        }
      }

      const { error } = await supabase.from('messages').insert({
        room_id: room.id,
        user_id: currentUser.id,
        content: text || (attachmentFile ? attachmentFile.name : ''),
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
      });

      if (error) {
        setChatError(`Mesaj gönderilemedi: ${error.message}`);
        return;
      }

      setNewMessage('');
      setAttachmentFile(null);
      setShowEmojis(false);
      await loadMessages();
    } finally {
      setSending(false);
    }
  };

  const toggleModeratorRole = async (member: RoomMember) => {
    if (!canManageMembers || member.role === 'owner') return;
    const nextRole: RoomRole = member.role === 'moderator' ? 'member' : 'moderator';
    await supabase
      .from('room_members')
      .update({ role: nextRole })
      .eq('id', member.id);
    loadMembers();
  };

  const removeMember = async (member: RoomMember) => {
    if (!canManageMembers || member.role === 'owner') return;
    await supabase.from('room_members').delete().eq('id', member.id);
    loadMembers();
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(room.invite_code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1500);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#0a0a0f]">
      {/* Orta Sohbet Alanı */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Oda Üst Başlığı */}
        <header className="h-13 px-4 border-b border-zinc-800 bg-[#12121a] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {room.is_private ? (
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Hash className="w-4 h-4 text-zinc-400 shrink-0" />
            )}
            <div className="truncate">
              <h2 className="text-sm font-semibold text-zinc-100 truncate">
                {room.name}
              </h2>
              {room.description && (
                <p className="text-[11px] text-zinc-400 truncate">
                  {room.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyInvite}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-xs text-zinc-300 transition cursor-pointer"
              title="Davet Kodunu Kopyala"
            >
              {copiedInvite ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span>Kod: {room.invite_code}</span>
            </button>

            {isInThisVoiceRoom ? (
              <button
                type="button"
                onClick={onLeaveVoiceRoom}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-medium transition cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                Sesten Ayrıl
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onJoinVoiceRoom(room.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Sese Katıl
              </button>
            )}
          </div>
        </header>

        {isInThisVoiceRoom && (
          <VoiceRoomPanel
            room={room}
            currentUser={currentUser}
            onLeave={onLeaveVoiceRoom}
          />
        )}

        {chatError && (
          <div className="mx-4 mt-2.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {chatError}
          </div>
        )}

        {/* Mesaj Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
              Bu odada henüz mesaj yok. İlk mesajı siz gönderin!
            </div>
          ) : (
            messages.map((msg) => {
              const senderName = msg.sender?.username || 'kullanici';
              const timeStr = new Date(msg.created_at).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const isImage =
                msg.file_url &&
                (msg.file_type?.startsWith('image/') ||
                  /\.(png|jpe?g|gif|webp)$/i.test(msg.file_url));

              return (
                <div
                  key={msg.id}
                  className="flex items-start gap-3 hover:bg-zinc-900/50 p-2 rounded-xl transition"
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 overflow-hidden">
                    {msg.sender?.avatar_url ? (
                      <img
                        src={msg.sender.avatar_url}
                        alt={senderName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      senderName.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        @{senderName}
                      </span>
                      <span className="text-[10px] text-zinc-500">{timeStr}</span>
                    </div>

                    {msg.content && (
                      <p className="text-sm text-zinc-300 break-words mt-0.5">
                        {msg.content}
                      </p>
                    )}

                    {msg.file_url && (
                      <div className="mt-2">
                        {isImage ? (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block"
                          >
                            <img
                              src={msg.file_url}
                              alt={msg.file_name || 'Ek görsel'}
                              className="max-h-60 rounded-lg border border-zinc-800 object-contain"
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#14141e] border border-zinc-800 text-xs text-indigo-300 hover:underline"
                          >
                            <FileText className="w-4 h-4" />
                            {msg.file_name || 'Dosyayı Aç / İndir'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Seçili Dosya ve Emoji Seçici */}
        {attachmentFile && (
          <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
            <span className="truncate">Ek: {attachmentFile.name}</span>
            <button
              type="button"
              onClick={() => setAttachmentFile(null)}
              className="text-xs text-zinc-400 hover:text-white ml-2 cursor-pointer"
            >
              Kaldır
            </button>
          </div>
        )}

        {showEmojis && (
          <div className="mx-4 mb-2 p-2 rounded-xl bg-[#14141e] border border-zinc-800 flex flex-wrap gap-1.5">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewMessage((prev) => `${prev}${emoji}`)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-base cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Mesaj Gönderme Formu */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t border-zinc-800 bg-[#12121a] flex items-center gap-2"
        >
          <label
            title="Dosya veya Görsel Ekle"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
            <input
              type="file"
              onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowEmojis((prev) => !prev)}
            title="Emoji Ekle"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition cursor-pointer"
          >
            <Smile className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`#${room.name} kanalına mesaj yaz...`}
            className="flex-1 bg-[#0a0a0f] border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
          />

          <button
            type="submit"
            disabled={sending}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Gönder
          </button>
        </form>
      </div>

      {/* Sağ Üye ve Rol Paneli */}
      <aside className="w-60 shrink-0 bg-[#101018] border-l border-zinc-800 flex flex-col h-full">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Üyeler ({members.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {members.map((m) => {
            const uname = m.profile?.username || 'kullanici';
            const isOwner = m.role === 'owner';
            const isMod = m.role === 'moderator';

            return (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/40 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-300 shrink-0">
                    {uname.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-medium text-zinc-200 truncate flex items-center gap-1">
                      @{uname}
                      {isOwner && (
                        <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                      {isMod && (
                        <Shield className="w-3 h-3 text-indigo-400 shrink-0" />
                      )}
                    </p>
                    <p className="text-[10px] text-zinc-500 capitalize">
                      {m.role}
                    </p>
                  </div>
                </div>

                {canManageMembers && !isOwner && m.user_id !== currentUser.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => toggleModeratorRole(m)}
                      title={
                        isMod ? 'Moderatörlüğü Al' : 'Moderatör Yap'
                      }
                      className="p-1 rounded hover:bg-zinc-700/70 text-indigo-400 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(m)}
                      title="Odadan Çıkar"
                      className="p-1 rounded hover:bg-zinc-700/70 text-red-400 cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}