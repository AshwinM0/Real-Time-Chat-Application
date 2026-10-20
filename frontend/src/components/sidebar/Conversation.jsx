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
      {/* A real button, so it can be reached with the keyboard and is named by the user's full name */}
      <button type="button" className={`flex gap-2 items-center w-full text-left hover:bg-sky-500 rounded p-2 py-1 cursor-pointer ${isSelected ? "bg-sky-500" : ""}`}
       onClick={ () => setSelectedConversation(conversation)}>
        <div className={`avatar ${isOnline ? "online" : ""}`}>
          <div className="w-12 rounded-full">
            {/* Empty alt: the name beside it already says who this is */}
            <img
              src={conversation.profilePic} alt=""/>
          </div>
          {/* The green dot is drawn by CSS, so screen readers need it in words */}
          {isOnline && <span className="sr-only">online</span>}
        </div>

        <div className="flex flex-col flex-1">
          <div className="flex gap-3 justify-between">
            <p className="font-bold text-gray-200">{conversation.fullName}</p>
            {/* The server stops counting at 100, so anything past 99 shows as 99+ */}
            {unreadCount > 0 && (
              <span className="badge badge-primary badge-sm" aria-label={`${unreadCount > 99 ? "More than 99" : unreadCount} unread messages`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {!lastIdx && <div className="divider my-0 py-0 h-1" />}
    </>
  );
};

export default Conversation;
