// Fetches a user's contribution calendar from the GitHub GraphQL API.
//
// The calendar is what the profile page shows: commits, pull requests, issues
// and reviews per day. If the user has "include private contributions" turned
// on, private work is counted too, as anonymous numbers.

const QUERY = `query($login: String!) { user(login: $login) { contributionsCollection {
  contributionCalendar { totalContributions weeks { contributionDays {
    contributionCount contributionLevel date weekday } } } } } }`;

export async function fetchCalendar(login, token) {
  if (!login) throw new Error('a GitHub user name is required');
  if (!token) throw new Error('a GitHub token is required (in Actions, the default github.token works)');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'hoops' },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL returned ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  if (!json.data?.user) throw new Error(`no GitHub user named "${login}"`);
  return json.data.user.contributionsCollection.contributionCalendar;
}
