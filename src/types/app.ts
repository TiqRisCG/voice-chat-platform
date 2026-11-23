export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  requester?: Profile;
  addressee?: Profile;
}

export type RoomRole = 'owner' | 'moderator' | 'member';

export interface Room {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  invite_code: string;
  owner_id: string;
  created_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: RoomRole;
  profile?: Profile;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  is_edited?: boolean;
  created_at: string;
  sender?: Profile;
}