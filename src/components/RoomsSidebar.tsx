'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Room } from '@/types/app';
import {
  Hash,
  Lock,
  Plus,
  KeyRound,
  Copy,
  Check,
  Volume2,
} from 'lucide-react';

interface Props {
  currentUser: Profile;
  selectedRoomId: string | null;
  activeVoiceRoomId: string | null;
  onSelectRoom: (room: Room) => void;
}

export default function RoomsSidebar({
  currentUser,
  selectedRoomId,
  activeVoiceRoomId,
  onSelectRoom,
}: Props) {
  const supabase = createClient();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', currentUser.id);

    const joinedIds = (memberRows || []).map((m) => m.room_id);

    const { data: publicRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('is_private', false);

    let privateRooms: Room[] = [];
    if (joinedIds.length > 0) {
      const { data: joinedData } = await supabase
        .from('rooms')
        .select('*')
        .in('id', joinedIds);
      privateRooms = joinedData || [];
    }

    const map = new Map<string, Room>();
    for (const r of [...(publicRooms || []), ...privateRooms]) {
      map.set(r.id, r);
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setRooms(sorted);
  }, [currentUser.id, supabase]);

  useEffect(() => {
    loadRooms();

    const channel = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadRooms();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members' },
        () => {
          loadRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRooms, supabase]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const cleanName = roomName.trim();
    if (!cleanName) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: createdRoom, error } = await supabase
      .from('rooms')
      .insert({
        name: cleanName,
        description: roomDesc.trim() || null,
        is_private: isPrivate,
        invite_code: code,
        owner_id: currentUser.id,
      })
      .select()
      .single();

    if (error || !createdRoom) {
      setFeedback('Oda oluşturulamadı. Veritabanı politikalarını kontrol edin.');
      return;
    }

    await supabase.from('room_members').insert({
      room_id: createdRoom.id,
      user_id: currentUser.id,
      role: 'owner',
    });

    setRoomName('');
    setRoomDesc('');
    setIsPrivate(false);
    setShowCreateModal(false);
    await loadRooms();
    onSelectRoom(createdRoom);
  };

const handleJoinByInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const code = inviteCodeInput.trim();
    if (!code) return;

    const { data: targetRoom, error } = await supabase
      .from('rooms')
      .select('*')
      .ilike('invite_code', code)
      .single();

    if (error || !targetRoom) {
      setFeedback('Bu davet koduna ait oda bulunamadı.');
      return;
    }

    await supabase.from('room_members').upsert(
      {
        room_id: targetRoom.id,
        user_id: currentUser.id,
        role: 'member',
      },
      { onConflict: 'room_id,user_id' }
    );

    setInviteCodeInput('');
    setShowJoinModal(false);
    await loadRooms();
    onSelectRoom(targetRoom);
  };
  const copyInviteCode = (e: React.MouseEvent, room: Room) => {
    e.stopPropagation();
    navigator.clipboard.writeText(room.invite_code);
    setCopiedId(room.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <aside className="w-72 shrink-0 bg-[#101018] border-r border-zinc-800 flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Odalar
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowJoinModal(!showJoinModal);
              setShowCreateModal(false);
              setFeedback(null);
            }}
            title="Davet Kodu ile Katıl"
            className="p-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 transition cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setShowCreateModal(!showCreateModal);
              setShowJoinModal(false);
              setFeedback(null);
            }}
            title="Yeni Oda Oluştur"
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mx-3 mt-2.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          {feedback}
        </div>
      )}

      {showCreateModal && (
        <form
          onSubmit={handleCreateRoom}
          className="m-3 p-3 rounded-xl bg-[#161622] border border-zinc-800 space-y-2.5"
        >
          <p className="text-xs font-semibold text-zinc-200">Yeni Oda</p>
          <input
            type="text"
            required
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Oda adı (örn. genel-sohbet)"
            className="w-full bg-[#0a0a0f] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs"
          />
          <input
            type="text"
            value={roomDesc}
            onChange={(e) => setRoomDesc(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            className="w-full bg-[#0a0a0f] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs"
          />
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Özel Oda (sadece davet kodu ile görünür)
          </label>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-2.5 py-1 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium cursor-pointer"
            >
              Oluştur
            </button>
          </div>
        </form>
      )}

      {showJoinModal && (
        <form
          onSubmit={handleJoinByInvite}
          className="m-3 p-3 rounded-xl bg-[#161622] border border-zinc-800 space-y-2.5"
        >
          <p className="text-xs font-semibold text-zinc-200">Davet Kodu ile Katıl</p>
          <input
            type="text"
            required
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value)}
            placeholder="6 haneli kod (örn. A1B2C3)"
            className="w-full bg-[#0a0a0f] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs uppercase"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowJoinModal(false)}
              className="px-2.5 py-1 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium cursor-pointer"
            >
              Katıl
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {rooms.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6 px-3">
            Henüz oda yok. Sağ üstteki <strong className="text-zinc-300">+</strong> butonuyla bir
            oda oluşturabilirsiniz.
          </p>
        ) : (
          rooms.map((room) => {
            const isSelected = room.id === selectedRoomId;
            const isInVoice = room.id === activeVoiceRoomId;

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition ${
                  isSelected
                    ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {room.is_private ? (
                    <Lock className="w-4 h-4 shrink-0 text-amber-400/80" />
                  ) : (
                    <Hash className="w-4 h-4 shrink-0 text-zinc-500" />
                  )}
                  <span className="text-xs font-medium truncate">{room.name}</span>
                  {isInVoice && (
                    <Volume2 className="w-3.5 h-3.5 shrink-0 text-emerald-400 animate-pulse" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => copyInviteCode(e, room)}
                  title={`Davet Kodu: ${room.invite_code} (Kopyala)`}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
                >
                  {copiedId === room.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}