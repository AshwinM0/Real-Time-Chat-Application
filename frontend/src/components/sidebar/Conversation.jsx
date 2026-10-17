import React from "react";
import useGetConversations from "../../hooks/useGetConversations";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";

const Conversation = ({conversation, lastIdx}) => {

  const {selectedConversation, setSelectedConversation} = useConversation()
  const { onlineUsers } = useSocketContext()

  const isSelected = selectedConversation?._id == conversation._id
  // onlineUsers is the list of user ids the server broadcasts on every connect/disconnect
  const isOnline = onlineUsers.includes(conversation._id)
  // Selector form of a Zustand hook: pick just this user's unread count out of the store.
  const unreadCount = useConversation((state) => state.unread[conversation._id] || 0)

  return (
    <>
      <div className={`flex gap-2 items-center hover:bg-sky-500 rounded p-2 py-1 cursor-pointer ${isSelected ? "bg-sky-500" : ""}`}
       onClick={ () => setSelectedConversation(conversation)}>
        <div className={`avatar ${isOnline ? "online" : ""}`}>
          <div className="w-12 rounded-full">
            <img
              src={conversation.profilePic} alt="user avatar"/>
          </div>
        </div>

        <div className="flex flex-col flex-1">
          <div className="flex gap-3 justify-between">
            <p className="font-bold text-gray-200">{conversation.fullName}</p>
            {unreadCount > 0 && <span className="badge badge-primary badge-sm">{unreadCount}</span>}
          </div>
        </div>
      </div>

      {!lastIdx && <div className="divider my-0 py-0 h-1" />}
    </>
  );
};

export default Conversation;
