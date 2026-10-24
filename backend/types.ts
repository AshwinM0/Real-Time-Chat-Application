// The JSON the API takes and answers with, where it isn't a document from MongoDB.
// The request bodies describe what the frontend sends. Nothing checks them when
// they arrive (tests BI-4 and BI-15), so they say what the code expects, not what
// a client can't send.

// Every error response. The frontend shows `error`.
export interface ErrorBody {
    error: string
}

// POST /api/auth/signup
export interface SignUpBody {
    fullName: string
    username: string
    password: string
    confirmPassword: string
    gender: "male" | "female"
}

// POST /api/auth/login
export interface LoginBody {
    username: string
    password: string
}

// POST /api/messages/send/:id
export interface SendMessageBody {
    message: string
}
