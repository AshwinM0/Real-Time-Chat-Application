import type { Gender } from '../../types'

// selectedGender is "" until one is picked.
const GenderCheckbox = ({onCheckboxChange, selectedGender}: { onCheckboxChange: (gender: Gender) => void, selectedGender: Gender | "" }) => {
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
