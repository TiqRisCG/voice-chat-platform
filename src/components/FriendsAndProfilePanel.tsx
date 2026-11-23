'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, FriendshipRow } from '@/types/app';
import {
  UserPlus,
  Check,
  X,
  Users,
  Settings,
  LogOut,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  currentUser: Profile;
  onlineUserIds: Set<string>;
  onProfileUpdated: (updated: Profile) => void;
}

export default function FriendsAndProfilePanel({
  currentUser,
  onlineUserIds,
  onProfileUpdated,
}: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [tab, setTab] = useState<'friends' | 'profile'>('friends');
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadFriendships = useCallback(async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        requester_id,
        addressee_id,
        status,
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, bio),
        addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, bio)
      `)
      .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

    if (!error && data) {
      const normalized: FriendshipRow[] = data.map((row: any) => ({
        id: row.id,
        requester_id: row.requester_id,
        addressee_id: row.addressee_id,
        status: row.status,
        requester: Array.isArray(row.requester) ? row.requester[0] : row.requester,
        addressee: Array.isArray(row.addressee) ? row.addressee[0] : row.addressee,
      }));
      setFriendships(normalized);
    }
  }, [currentUser.id, supabase]);

  useEffect(() => {
    loadFriendships();

    const channel = supabase
      .channel('friendships-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          loadFriendships();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFriendships, supabase]);

  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const cleanName = targetUsername.trim().toLowerCase();
    if (!cleanName) return;

    if (cleanName === currentUser.username.toLowerCase()) {
      setStatusMessage('Kendinize arkadaşlık isteği gönderemezsiniz.');
      return;
    }

    const { data: targetProfile, error: findErr } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', cleanName)
      .single();

    if (findErr || !targetProfile) {
      setStatusMessage('Bu kullanıcı adına sahip biri bulunamadı.');
      return;
    }

    const { error: insertErr } = await supabase.from('friendships').insert({
      requester_id: currentUser.id,
      addressee_id: targetProfile.id,
      status: 'pending',
    });

    if (insertErr) {
      setStatusMessage('İstek zaten gönderilmiş veya kayıtlı.');
    } else {
      setTargetUsername('');
      setStatusMessage(`@${targetProfile.username} kullanıcısına istek gönderildi.`);
      loadFriendships();
    }
  };

  const respondRequest = async (friendshipId: string, accept: boolean) => {
    if (accept) {
      await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
    } else {
      await supabase.from('friendships').delete().eq('id', friendshipId);
    }
    loadFriendships();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop();
    const filePath = `avatars/${currentUser.id}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, { upsert: true });

    if (!uploadErr) {
      const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setStatusMessage(null);

    const { data, error } = await supabase
      .from('profiles')
      .update({
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id)
      .select()
      .single();

    setSavingProfile(false);
    if (error) {
      setStatusMessage('Profil güncellenemedi (kullanıcı adı başka birinde olabilir).');
    } else if (data) {
      onProfileUpdated(data);
      setStatusMessage('Profil bilgileri kaydedildi.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const incomingRequests = friendships.filter(
    (f) => f.status === 'pending' && f.addressee_id === currentUser.id
  );
  const acceptedFriends = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.requester_id === currentUser.id ? f.addressee : f.requester))
    .filter((p): p is Profile => Boolean(p));

  return (
    <div className="flex flex-col h-full bg-[#12121a] border-r border-zinc-800 w-80 shrink-0">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex gap-1 bg-[#0a0a0f] p-1 rounded-lg border border-zinc-800/80">
          <button
            onClick={() => setTab('friends')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              tab === 'friends'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Arkadaşlar ({acceptedFriends.length})
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              tab === 'profile'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Profil
          </button>
        </div>

        <button
          onClick={handleLogout}
          title="Çıkış Yap"
          className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {statusMessage && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
          {statusMessage}
        </div>
      )}

      {tab === 'friends' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <form onSubmit={sendFriendRequest} className="flex gap-1.5">
            <input
              type="text"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder="Kullanıcı adı ile ekle..."
              className="flex-1 bg-[#0a0a0f] border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Ekle
            </button>
          </form>

          {incomingRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Gelen İstekler ({incomingRequests.length})
              </p>
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-[#0a0a0f] border border-zinc-800 rounded-lg p-2.5"
                >
                  <span className="text-xs font-medium text-zinc-200">
                    @{req.requester?.username}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => respondRequest(req.id, true)}
                      className="p-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 cursor-pointer"
                      title="Kabul Et"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => respondRequest(req.id, false)}
                      className="p-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 cursor-pointer"
                      title="Reddet"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Arkadaş Listesi
            </p>
            {acceptedFriends.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                Henüz ekli arkadaşınız yok.
              </p>
            ) : (
              acceptedFriends.map((friend) => {
                const isOnline = onlineUserIds.has(friend.id);
                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/40 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden text-xs font-bold text-zinc-300">
                          {friend.avatar_url ? (
                            <img
                              src={friend.avatar_url}
                              alt={friend.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            friend.username.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <span
                          className={`w-2.5 h-2.5 rounded-full border-2 border-[#12121a] absolute -bottom-0.5 -right-0.5 ${
                            isOnline ? 'bg-emerald-500' : 'bg-zinc-600'
                          }`}
                        />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-medium text-zinc-200 truncate">
                          @{friend.username}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSaveProfile} className="p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-base font-bold">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                username.slice(0, 2).toUpperCase()
              )}
            </div>
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Fotoğraf Seç
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Kullanıcı Adı</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-zinc-800 rounded-lg px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Hakkımda / Biyografi</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Kısa bir not yazın..."
              className="w-full bg-[#0a0a0f] border border-zinc-800 rounded-lg px-3 py-2 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium cursor-pointer"
          >
            {savingProfile ? 'Kaydediliyor...' : 'Profili Kaydet'}
          </button>
        </form>
      )}
    </div>
  );
}