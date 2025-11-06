/**
 * Shared Services barrel export
 */

// Index files are a weird thing. In regards to functions, they are our
// actual functions that get executed. But in regards to folders, they
// are "barrel" files that just import and export stuff for the folder.
// The common thread here is that index files are always entry points

export {
    type ErrorMetadata,
    logger,
    type LogMetadata,
} from "./logger-service.ts";
export {
    exchangeCodeForToken,
    exchangeForLongLivedToken,
    getAllRelevantEvents,
    getPageEvents,
    getUserPages,
} from "./facebook-service.ts";
