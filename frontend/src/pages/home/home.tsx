import Sidebar from '../../components/sidebar/Sidebar'
import MessageContainer from '../../components/messages/MessageContainer'
import useListenMessages from '../../hooks/useListenMessages'
import useUnreadCounts from '../../hooks/useUnreadCounts'

const Home = () => {
  // Listen here rather than in Messages: Home is mounted for the whole logged-in session.
  useListenMessages()
  useUnreadCounts()

  return (
    <div className='flex sm:h-[450px] md:h-[550px] rounded-lg overflow-hidden bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
      <Sidebar />
      <MessageContainer />
    </div>
  )
}

export default Home
