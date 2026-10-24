import React, { useState } from 'react'
import { BsSend } from "react-icons/bs";
import { BsSendFill } from "react-icons/bs";
import useSendMessage from '../../hooks/useSendMessage';

const MessageInput = () => {

  const [message,setMessage] = useState("")
  const {loading, sendMessage} = useSendMessage()

  const handleSubmit = async (e) => {
    e.preventDefault()
    // The text stays in the box until the server answers, so a second Enter or
    // click in the meantime would send (and save) it again. The disabled button
    // below stops both; this check also covers any other way the form is submitted.
    if(!message || loading) return;

    // Only clear it once sent. If sending failed, for example because of sending
    // too fast, the text stays so the user can send it again.
    if(await sendMessage(message)) setMessage("")
  }

  return (
    <form className='px-4 my-3' onSubmit={handleSubmit}>
        <div className='w-full relative'>
            <input type='text' className='border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white'
             placeholder='Send a Message' value={message} onChange={(e) => {setMessage(e.target.value)}}/>
            {/* Disabled while sending. A disabled submit button also stops Enter from submitting the form. */}
            <button type='submit' aria-label='Send message' disabled={loading} className='absolute inset-y-0 end-0 flex items-center pe-3'>
              {loading ? <span className='loading loading-spinner'></span> : <BsSendFill />}
            </button>
        </div>
    </form>
  )
}

export default MessageInput