import React from 'react'
import Conversation from './Conversation'

const Conversations = ({loading, conversations}) => {

  return (
    <div className='py-2 flex flex-col overflow-auto'>

      {
        conversations.map((conv, idx) => (
          <Conversation key={conv._id} conversation={conv} lastIdc={idx==conversations.length - 1}/>
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
