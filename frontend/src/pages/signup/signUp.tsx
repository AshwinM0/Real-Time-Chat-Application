import { Link } from 'react-router'
import GenderCheckbox from './GenderCheckbox'
import { useState, type FormEvent } from 'react'
import useSignUp, { type SignUpInputs } from '../../hooks/useSignUp'
import type { Gender } from '../../types'

const SignUp = () => {

  const [inputs, setInputs] = useState<SignUpInputs>(
    {
      fullName: '',
      username: '',
      password: '',
      confirmPassword: '',
      gender: ''
    }
  )

  const {loading, signup} = useSignUp()

  const handleCheckboxChange = (gender: Gender) => {
    setInputs({...inputs, gender})
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await signup(inputs)
  }

  return (
    <div className='flex flex-col items-center justify-center min-w-96 mx-auto'>
      <div className='w-full p-6 rounded-lg shadow-md bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
        <h1 className='text-3xl font-semibold text-center text-gray-300'>
          Sign Up
          <span className='text-blue-500'> ChatApp</span>
        </h1>

        <form onSubmit={handleSubmit}>
          <div>
            <label className='label p-2'>
              <span className='text-base label-text'>Full Name</span>
            </label>
            <input type='text' placeholder='John Doe' className='w-full input input-bordered h-10'
             value={inputs.fullName} onChange={(e) => setInputs({...inputs, fullName: e.target.value})} />
          </div>

          <div>
            <label className='label p-2'>
              <span className='text-base label-text'>Username</span>
            </label>
            <input type='text' placeholder='johndoe' value={inputs.username}
             className='w-full input input-bordered h-10' onChange={(e) => setInputs({...inputs, username: e.target.value})} />
          </div>

          <div>
            <label className='label p-2'>
              <span className='text-base label-text'>Password</span>
            </label>
            <input type='password' placeholder='Enter Password' value={inputs.password}
            className='w-full input input-bordered h-10' onChange={(e) => setInputs({...inputs, password: e.target.value})} />
          </div>

          <div>
            <label className='label p-2'>
              <span className='text-base label-text'>Confirm Password</span>
            </label>
            <input type='password' placeholder='Re-enter Password' value={inputs.confirmPassword}
            className='w-full input input-bordered h-10' onChange={(e) => setInputs({...inputs, confirmPassword: e.target.value})} />
          </div>

          <GenderCheckbox onCheckboxChange={handleCheckboxChange} selectedGender={inputs.gender} />

          <Link to='/login' className='text-sm hover:underline hover:text-blue-600 mt-2 inline-block'>
            Already have an account?
          </Link>

          <div>
            <button className="btn btn-block btn-sm mt-2 border border-slate-700" disabled={loading}>
              {loading ? <span className='loading loading-spinner'></span>
                :
                "Sign Up"
              }
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

export default SignUp
