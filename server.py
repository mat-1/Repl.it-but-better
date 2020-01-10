from aiohttp import web
import aiohttp
import client
import os
from templates import Template


verified_username = os.getenv('username').lower()
key = os.getenv('key')

routes = web.RouteTableDef()



@routes.get('/')
async def index(request):
	print('/')
	
	repls_data = await client.dashboard_repls(request.sid)
	print(repls_data)
	repls_data = repls_data['data']['dashboardRepls']
	repls = repls_data['items']
	print('ok')
	return Template(
		'index.html',
		repls=repls
	)

@routes.get('/login')
async def login_get(request):
	return Template(
		'login.html'
	)

@routes.post('/login')
async def login_post(request):
	post_data = await request.post()
	username = post_data['username']
	if username.lower() != verified_username:
		return Template(
			'login.html',
			message='Invalid username'
		)
	password = post_data['password']
	sid = await client.login(username, password)
	r = web.HTTPFound('/')
	r.set_cookie(
		'sid',
		sid,
		max_age=31557600
	)
	return r

@routes.get('/@{user}/{slug}')
async def view_repl(request):
	repl_user = request.match_info['user']
	repl_slug = request.match_info['slug']
	repl_json = await client.repl_data(repl_user, repl_slug, request.sid)
	repl_id = repl_json['id']
	repl_token = await client.gen_repl_token(repl_id, request.sid, key)
	return Template(
		'repl.html',
		repl=repl_json,
		token=repl_token
	)



@web.middleware
async def middleware(request, handler):
	sid = request.cookies.get('sid')
	request.sid = sid

	current_username = await client.current_username(request.sid)

	if not current_username and request.path != '/login':
		return web.HTTPFound('/login')
	username = current_username.lower() if current_username else None
	if username != verified_username and request.path != '/login':
		return web.HTTPFound('/login')

	resp = await handler(request)
	if isinstance(resp, Template):
		resp = web.Response(
			text=await resp.render(),
			content_type='text/html'
		)
	return resp

def start():
	app = web.Application(
		middlewares=[middleware]
	)
	app.add_routes(routes)
	app.add_routes([web.static('/', 'static')])
	web.run_app(app)
