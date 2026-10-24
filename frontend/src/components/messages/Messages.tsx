import { useLayoutEffect, useRef } from 'react'
import Message from './Message'
import useGetMessages from '../../hooks/useGetMessages'
import MessageSkeleton from '../skeletons/MessageSkeleton'

// How close to the top, in pixels, the user has to scroll before older messages load.
const LOAD_OLDER_WITHIN = 100

const Messages = () => {

  const {loading, messages, hasOlder, loadingOlder, loadOlder} = useGetMessages()
  const listRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  // What the previous render showed, to tell what changed: the first and last
  // message ids, and how far the user was from the bottom of the list.
  const previous = useRef<{ firstId?: string, lastId?: string, fromBottom: number }>({ firstId: undefined, lastId: undefined, fromBottom: 0 });

  // A layout effect runs after the DOM updates but before the browser paints, so
  // the scroll position changes without a visible jump.
  useLayoutEffect(() => {
    // Always set: the list below is rendered whatever state the chat is in.
    const list = listRef.current
    if(!list) return
    const shown = loading ? [] : messages
    const firstId = shown[0]?._id
    const lastId = shown[shown.length - 1]?._id
    const before = previous.current

    if(lastId !== undefined && before.lastId === undefined) {
      // The chat just opened: start at the newest message, not at the top (which
      // would also load older messages straight away).
      list.scrollTop = list.scrollHeight
    }
    if(lastId !== before.lastId) {
      // A new message at the end: glide down to it.
      setTimeout(() => {
        lastMessageRef.current?.scrollIntoView({ behavior : 'smooth' });
      }, 100)
    } else if(firstId !== before.firstId) {
      // Older messages were added above. Keep what the user was reading in place,
      // instead of jumping to the top, by restoring the distance from the bottom.
      list.scrollTop = list.scrollHeight - before.fromBottom
    }
    previous.current = { ...before, firstId, lastId }
  }, [loading, messages])

  const onScroll = () => {
    const list = listRef.current
    if(!list) return
    previous.current.fromBottom = list.scrollHeight - list.scrollTop
    if(list.scrollTop < LOAD_OLDER_WITHIN && hasOlder && !loadingOlder) loadOlder()
  }

  // overflow-anchor: none turns off the browser's own scroll anchoring, which would
  // otherwise also adjust for messages added above and double the correction.
  return (
    <div ref={listRef} onScroll={onScroll} data-testid='message-list' className='px-4 flex-1 overflow-auto relative [overflow-anchor:none]'>
			{/* Absolutely positioned, so it doesn't push the messages down while loading. */}
			{loadingOlder && (
				<div className='absolute top-2 inset-x-0 flex justify-center'>
					<span className='loading loading-spinner loading-sm' aria-label='Loading older messages'></span>
				</div>
			)}

			{!loading &&
				messages.length > 0 &&
				messages.map((message) => {
          return (
					<div key={message._id} ref={lastMessageRef}>
						<Message message={message} />
					</div>
				)})}

			{loading && Array.from({ length: 3 }, (_, idx) => <MessageSkeleton key={idx} />)}
			{!loading && messages.length === 0 && (
				<p className='text-center'>Send a message to start the conversation</p>
			)}
		</div>
  )
}

export default Messages
