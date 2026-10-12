import click
from frappe.commands import get_site, pass_context


def _run(context, fn):
	import frappe

	site = get_site(context)
	frappe.init(site)
	frappe.connect()
	try:
		fn()
	finally:
		frappe.destroy()


@click.command("re-seed-demo")
@pass_context
def seed_demo(context):
	"Generate the Zarmeen Gardens sample project (skips if it already exists)"
	from realestate.demo.seed import run

	_run(context, run)


@click.command("re-reset-demo")
@pass_context
def reset_demo(context):
	"Delete the sample project and its demo data, then generate it again"
	from realestate.demo.seed import reset

	_run(context, reset)


@click.command("re-daily-data")
@click.option("--days", default=1, help="Generate the last N days, oldest first (default: today only)")
@click.option("--force", is_flag=True, help="Run a day again even if it was already generated")
@pass_context
def daily_data(context, days=1, force=False):
	"Add a live day of activity to the demo: leads, visits, follow-ups, bookings, receipts, operations, society jobs, stock"
	from realestate.demo.daily import catch_up

	_run(context, lambda: catch_up(days, force))


@click.command("re-acceptance")
@click.option("--verbose", is_flag=True, help="Show the evidence lines for every check")
@pass_context
def acceptance(context, verbose=False):
	"Check the acceptance criteria and role / security rules against the live data (read-only)"
	import sys

	import frappe

	from realestate.acceptance import run_all

	marks = {"pass": "PASS ", "warn": "WARN ", "fail": "FAIL ", "manual": "CHECK"}
	failed = False

	def go():
		nonlocal failed
		frappe.set_user("Administrator")
		out = run_all()
		frappe.db.rollback()
		for r in out["results"]:
			click.echo(f"{marks[r['status']]}  {r['title']}  ({r['seconds']}s)\n       {r['detail']}")
			if verbose or r["status"] in ("fail", "warn"):
				for e in r["evidence"]:
					click.echo(f"         · {e}")
		click.echo(f"\n{out['summary']}")
		failed = out["summary"]["fail"] > 0

	_run(context, go)
	sys.exit(1 if failed else 0)


commands = [seed_demo, reset_demo, daily_data, acceptance]
