"use client";

import { useEffect, useState } from "react";
import type { WebsocketProvider } from "y-websocket";

interface CollaboratorUser {
  name: string;
  color: string;
  id?: string;
}

interface CollaboratorAvatarsProps {
  provider: WebsocketProvider | null;
}

export function CollaboratorAvatars({ provider }: CollaboratorAvatarsProps) {
  const [users, setUsers] = useState<CollaboratorUser[]>([]);

  useEffect(() => {
    if (!provider) return;

    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const collaborators: CollaboratorUser[] = [];
      const localClientId = provider.awareness.clientID;

      states.forEach((state, clientId) => {
        if (clientId !== localClientId && state.user) {
          collaborators.push(state.user as CollaboratorUser);
        }
      });

      setUsers(collaborators);
    };

    provider.awareness.on("change", updateUsers);
    updateUsers();

    return () => {
      provider.awareness.off("change", updateUsers);
    };
  }, [provider]);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map((u, i) => (
        <div
          key={u.id ?? i}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: u.color }}
          title={u.name}
        >
          {u.name.charAt(0).toUpperCase()}
        </div>
      ))}
      <span className="ml-1 text-xs text-gray-500">
        {users.length > 0 && `${users.length}`}
      </span>
    </div>
  );
}
