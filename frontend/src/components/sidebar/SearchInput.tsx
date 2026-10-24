import { useState, type FormEvent } from 'react'
import { IoSearchSharp } from "react-icons/io5";
import useConversation from '../../zustand/useConversation';
import toast from 'react-hot-toast';
import type { User } from '../../types';

const SearchInput = ({conversations}: { conversations: User[] }) => {

  const [search, setSearch] = useState("")
  const {setSelectedConversation} = useConversation()


  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if(!search) return

    if(search.length<3) {
      return toast.error('Search string must be at least 3 characters')
    }

    const conversation = conversations.find((c) => c.fullName.toLowerCase().includes(search.toLowerCase()))

    if(conversation) {
      setSelectedConversation(conversation)
      setSearch('')
    } else {
      toast.error("No such user found")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-4">
        <input type="text" placeholder="Search..."
         className="input input-bordered rounded-full" value={search}
         onChange={(e) => {setSearch(e.target.value)}}/>
        <button type="submit" className="btn btn-circle bg-sky-500 text-white">
            <IoSearchSharp className='w-6 h-6 outline-none' />
        </button>
    </form>
  )
}

export default SearchInput
