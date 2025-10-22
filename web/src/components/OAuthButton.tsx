import { buildFacebookLoginUrl } from '../utils/oauth';

// in frontend, we use React/ts components to render stuff, anything from a small button to a whole page
// therefore a lot of the code is going to be in /components/ and /pages/ folders as .tsx files. This 
// means "typescript extension", which allows us to do html shenanigans inside ts files.

// This file is specifically for a button that initiates the Facebook OAuth flow.

/**
 * Button to initiate Facebook OAuth flow
 */
export function OAuthButton() {
  return (
    <div className="mb-4"> {/* mb = margin bottom, size = 4x for spacing things out*/}
      <a // a is an anchor tag, aka a link
        href={buildFacebookLoginUrl()} // when clicked, go to facebook oauth url thru our util function
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
      >
        Connect Facebook Page {/* title/actual text */}
      </a>
    </div>
  );
}
