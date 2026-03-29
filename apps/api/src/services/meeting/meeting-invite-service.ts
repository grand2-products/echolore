// Thin re-export — add authorization / rate-limiting logic here as needed
export {
  createInvite,
  findInviteByToken,
  findValidInviteByToken,
  getGuestRequestByIdAndInvite,
  incrementUseCountAndCreateGuestRequest,
  listGuestRequestsByMeeting,
  listInvitesByMeeting,
  resolveGuestRequest,
  revokeInvite,
} from "../../repositories/meeting/meeting-invite-repository.js";

export { getMeetingRoomName } from "../../repositories/meeting/meeting-repository.js";
