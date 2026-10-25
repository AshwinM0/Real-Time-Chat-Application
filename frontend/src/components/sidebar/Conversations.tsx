import Conversation from './Conversation'
import type { User } from '../../types'

interface ConversationsProps {
  loading: boolean
  conversations: User[]
}

const Conversations = ({loading, conversations}: ConversationsProps) => {

  return (
    <div className='py-2 flex flex-col overflow-auto'>

      {
        conversations.map((conv, idx) => (
          <Conversation key={conv._id} conversation={conv} lastIdx={idx==conversations.length - 1}/>
        ))
      }

      {
        loading ? <span className='loading loading-spinner'></span>
         :
        null
      }
    </div>
  )
}

export default Conversations
