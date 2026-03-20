// Thin re-export — add authorization / rate-limiting logic here as needed
export {
  createInvite,
  findInviteByToken,
  findValidInviteByToken,
  getGuestRequestByIdAndInvite,
  getMeetingRoomName,
  incrementUseCountAndCreateGuestRequest,
  listGuestRequestsByMeeting,
  listInvitesByMeeting,
  resolveGuestRequest,
  revokeInvite,
} from "../../repositories/meeting/meeting-invite-repository.js";
