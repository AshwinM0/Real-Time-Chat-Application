import { useAuthContext } from '../../context/AuthContext'
import useConversation from '../../zustand/useConversation';
import { extractTime } from '../../utils/extractTime';
import type { ChatMessage } from '../../types';

const Message = ({message}: { message: ChatMessage }) => {

  const {authUser} = useAuthContext();
  const {selectedConversation} = useConversation()

  const fromMe = message.senderId == authUser?._id
  const chatClassName = fromMe ? 'chat-end' : 'chat-start'
  const profilePic = fromMe ? authUser?.profilePic : selectedConversation?.profilePic
  const bubbleBgCOLOR = fromMe ? 'bg-blue-500' : ""


  return (
    <div className={`chat ${chatClassName}`}>
        <div className='chat-image avatar'>
            <div className='w-10 rounded-full'>
                <img src={profilePic} alt="Tailwind CSS chat bubble component" />
            </div>
        </div>
        <div data-testid='message' className={`chat-bubble text-white ${bubbleBgCOLOR}`}> {message.message} </div>
        <div className='chat-footer opacity-50 text-xs flex gap-1 items-center'>{extractTime(message.createdAt)}</div>
    </div>
  )
}

export default Message
