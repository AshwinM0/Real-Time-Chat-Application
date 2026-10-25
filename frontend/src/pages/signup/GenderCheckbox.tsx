import type { Gender } from '../../types'

interface GenderCheckboxProps {
  onCheckboxChange: (gender: Gender) => void
  // "" until one is picked.
  selectedGender: Gender | ""
}

const GenderCheckbox = ({onCheckboxChange, selectedGender}: GenderCheckboxProps) => {
  return (
    <div className='flex mt-2'>
        <div className='form-control'>
            <label className={`label gap-2 cursor-pointer`}>
                <span className='label-text'>Male</span>
                <input type='checkbox' className='checkbox border-slate-900'
                checked={selectedGender == "male"}
                onChange={() => onCheckboxChange("male")} />
            </label>
        </div>
        <div className='form-control'>
            <label className={`label gap-2 cursor-pointer`}>
                <span className='label-text'>Female</span>
                <input type='checkbox' className='checkbox border-slate-900'
                checked={selectedGender == "female"}
                onChange={() => onCheckboxChange("female")} />
            </label>
        </div>
    </div>
  )
}

export default GenderCheckbox
