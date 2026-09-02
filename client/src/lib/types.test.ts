import { describe, expect, it } from "vitest";
import type { Tables } from "./database.types";
import { profileFromRow, taskFromRow } from "./types";

describe("generated database row normalization", () => {
  it("turns nullable profile defaults into the UI-safe profile shape", () => {
    const row: Tables<"profiles"> = {
      id: "profile-id",
      username: "focus_friend",
      discriminator: "0042",
      username_changed: null,
      display_name: null,
      display_name_changed_at: null,
      avatar_config: null,
      is_premium: null,
      current_room: null,
      current_session_id: null,
      current_world_id: null,
      updated_at: null,
    };

    expect(profileFromRow(row)).toMatchObject({
      is_premium: false,
      username_changed: false,
      updated_at: "1970-01-01T00:00:00.000Z",
    });
  });

  it("normalizes task defaults and keeps the database-only session link private", () => {
    const row: Tables<"tasks"> = {
      id: "task-id",
      owner_id: "profile-id",
      content: "Focus",
      room_code: null,
      session_id: "session-id",
      completed_by: null,
      created_at: null,
      is_done: null,
      is_shared: null,
    };

    expect(taskFromRow(row)).toEqual({
      id: "task-id",
      owner_id: "profile-id",
      content: "Focus",
      room_code: null,
      completed_by: null,
      created_at: "1970-01-01T00:00:00.000Z",
      is_done: false,
      is_shared: false,
    });
  });
});
