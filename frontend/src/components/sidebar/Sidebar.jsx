import React from 'react'
import SearchInput from './SearchInput'
import Conversations from './Conversations'
import LogoutButton from './LogoutButton'
import useGetConversations from '../../hooks/useGetConversations'

const Sidebar = () => {
  // Fetch the user list once here and share it, instead of each child fetching its own copy.
  const {loading, conversations} = useGetConversations()

  return (
    <div className='border-r border-slate-500 p-4 flex flex-col'>
      <SearchInput conversations={conversations} />
      {/* SearchInput */}
      <div className="divider px-3">

      </div>

      <Conversations loading={loading} conversations={conversations} />
      <LogoutButton />
    </div>
  )
}

export default Sidebar

