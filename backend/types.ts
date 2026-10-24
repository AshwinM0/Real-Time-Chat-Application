// The JSON the API answers with, where it isn't a document from MongoDB. What it
// accepts is in validation.ts, where each type comes from the schema that checks it.

// Every error response. The frontend shows `error`.
export interface ErrorBody {
    error: string
}
