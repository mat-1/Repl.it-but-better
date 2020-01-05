from aiohttp import web
from jinja2 import Environment, FileSystemLoader, select_autoescape


routes = web.RouteTableDef()

jinja_env = Environment(
	loader=FileSystemLoader(searchpath='templates'),
	autoescape=select_autoescape(['html', 'xml']),
	enable_async=True,
	extensions=[],
	trim_blocks=True,
	lstrip_blocks=True
)

class Template:
	def __init__(self, filename, **args):
		self.filename = filename
		self.args = args

	async def render(self):
		template = jinja_env.get_template(self.filename)
		rendered = await template.render_async(**self.args)
		return rendered

@routes.get('/')
async def index(request):
	return Template(
		'index.html',
		entries=entries,
		entry_count=entry_count
	)