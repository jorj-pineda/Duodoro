const CLIENT_EVENT_NAMES = Object.freeze([
  'register_user',
  'get_online_friends',
  'delete_account',
  'send_invite',
  'create_session',
  'create_share_invite',
  'join_session',
  'start_session',
  'finish_flow_focus',
  'stop_session',
  'set_pet',
  'leave_session',
  'request_sync',
]);

const SERVER_EVENT_NAMES = Object.freeze([
  'session_created',
  'session_error',
  'sync_state',
  'phase_change',
  'player_joined',
  'pet_changed',
  'player_disconnected',
  'player_left',
  'session_invite',
  'invite_error',
  'presence_update',
]);

module.exports = { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES };
