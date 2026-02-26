import type { AvatarConfig } from "./avatarData";

export type { AvatarConfig };

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_config: AvatarConfig | null;
  is_premium: boolean;
  current_room: string | null;
  updated_at: string;
};

export type FriendshipStatus = "pending" | "accepted";

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  // Joined profile (the friend's profile, not ours)
  friend: Profile;
};

export type Task = {
  id: string;
  owner_id: string;
  room_code: string | null;
  content: string;
  is_done: boolean;
  is_shared: boolean;
  created_at: string;
};

export type PetType = "cat" | "dog" | "dragon" | "rabbit";

export const PET_OPTIONS: { type: PetType; label: string; emoji: string }[] = [
  { type: "cat",    label: "Cat",    emoji: "🐱" },
  { type: "dog",    label: "Dog",    emoji: "🐶" },
  { type: "dragon", label: "Dragon", emoji: "🐉" },
  { type: "rabbit", label: "Rabbit", emoji: "🐰" },
];
