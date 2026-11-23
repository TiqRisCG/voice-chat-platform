'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Profile, Room } from '@/types/app';
import FriendsAndProfilePanel from '@/components/FriendsAndProfilePanel';
import RoomsSidebar from '@/components/RoomsSidebar';
import RoomChatAndMembers from '@/components/RoomChatAndMembers';

export default function HomePage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [activeVoiceRoomId, setActiveVoiceRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      if (userProfile) {
        setProfile(userProfile);

        const channel = supabase.channel('global-presence', {
          config: { presence: { key: user.id } },
        });
        presenceChannel = channel;

        channel
          .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const ids = new Set<string>(Object.keys(state));
            setOnlineUserIds(ids);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await channel.track({
                user_id: user.id,
                online_at: new Date().toISOString(),
              });
            }
          });
      }

      setLoading(false);
    };

    init();

    return () => {
      cancelled = true;
      if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
      }
    };
  }, [router, supabase]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-zinc-400 flex items-center justify-center text-sm">
        Oturum ve profil bilgileri yükleniyor...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0f] text-zinc-100 flex">
      <FriendsAndProfilePanel
        currentUser={profile}
        onlineUserIds={onlineUserIds}
        onProfileUpdated={(updated) => setProfile(updated)}
      />

      <RoomsSidebar
        currentUser={profile}
        selectedRoomId={selectedRoom?.id || null}
        activeVoiceRoomId={activeVoiceRoomId}
        onSelectRoom={(room) => setSelectedRoom(room)}
      />

      {selectedRoom ? (
        <RoomChatAndMembers
          currentUser={profile}
          room={selectedRoom}
          activeVoiceRoomId={activeVoiceRoomId}
          onJoinVoiceRoom={(roomId) => setActiveVoiceRoomId(roomId)}
          onLeaveVoiceRoom={() => setActiveVoiceRoomId(null)}
        />
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-zinc-200">
              Hoş geldin, @{profile.username}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Sol taraftaki <strong className="text-zinc-200">Odalar</strong> panelinden bir oda
              seçin veya <strong className="text-indigo-400">+</strong> butonuyla yeni bir oda
              oluşturun.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}