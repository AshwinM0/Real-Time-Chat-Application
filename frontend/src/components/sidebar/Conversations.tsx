import Conversation from './Conversation'
import type { User } from '../../types'

const Conversations = ({loading, conversations}: { loading: boolean, conversations: User[] }) => {

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
