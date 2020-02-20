import aiohttp

requested_with = 'replit-but-better'

async def post_request(url, json, cookies={}):
	if url[0] == '/': url = 'https://repl.it' + url
	async with aiohttp.ClientSession() as s:
		r = await s.post(
			url,
			json=json,
			headers={
				'x-requested-with': requested_with,
				'referer': 'https://repl.it'
			},
			cookies=cookies
		)
		return r

async def get_request(url, cookies={}):
	if url[0] == '/': url = 'https://repl.it' + url
	async with aiohttp.ClientSession() as s:
		r = await s.get(
			url,
			headers={
				'x-requested-with': requested_with,
				'referer': 'https://repl.it'
			},
			cookies=cookies
		)
		return r

async def login(username, password):
	print('logging in')
	r = await post_request(
		'/login',
		{
			'username': username,
			'password': password,
			'teacher': False,
		}
	)
	return str(r.cookies['connect.sid'].value)

async def repl_data(user, slug, sid=None):
	r = await get_request(
		f'/data/repls/@{user}/{slug}',
		{
			'connect.sid': sid
		}
	)
	return await r.json()

async def graphql(operation_name, sid=None, **variables):
	with open(f'queries/{operation_name}.gql', 'r') as f:
		query = f.read()
	r = await post_request(
		'/graphql',
		{
			'operationName': operation_name,
			'query': query,
			'variables': variables,
		},
		{
			'connect.sid': sid
		}
	)
	return await r.json()

async def current_user(sid):
	return await graphql('currentUser', sid)

async def dashboard_repls(sid):
	return await graphql('dashboardRepls', sid)

async def current_username(sid):
	if not hasattr(current_username, 'cache'):
		current_username.cache = {}
	if sid in current_username.cache:
		r = current_username.cache[sid]
	else:
		r = await current_user(sid)
		current_username.cache[sid] = r
	if not r: return
	if not r['data']['currentUser']: return
	return r['data']['currentUser']['username']

async def gen_repl_token(repl_id, sid, api_key):
	print(repl_id, sid, api_key)
	r = await post_request(
		f'/api/v0/repls/{repl_id}/token',
		{
			'apiKey': api_key
		},
		{
			'connect.sid': sid
		}
	)
	token = await r.json()
	print('token:', token)
	return token