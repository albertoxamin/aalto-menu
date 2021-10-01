const Telegraf = require('telegraf')
const { Telegram, Markup } = require('telegraf')
const request = require('request')
const crypto = require('crypto')
const moment = require('moment')

var config
try { config = require('./config') } catch (err) {
	config = {
		token: process.env.token
	}
}

const telegram = new Telegram(config.token, null)
const bot = new Telegraf(config.token)

const schedule = require('node-schedule');

const job = schedule.scheduleJob('0 */1 * * *', function () {
	getCanteens(() => { })
});



const msgCanteenMenu = (obj) => {
	let canteen = canteens.filter(x => x.id === obj.id)[0]
	let message = `<b>${canteen.name}</b> Menu for today:\n\n`
	obj.menu.forEach(d => {
		if (d.title)
			message += `${d.title} <i>${d.properties}</i>\n`
	})
	return message + `\n<a href="https://www.google.com/maps/search/?api=1&query=${canteen.address}">📍 Location</a>\n⏰️ ${canteen.openingHours[moment().isoWeekday() - 1]}`
}


bot.telegram.getMe().then((bot_informations) => {
	bot.options.username = bot_informations.username
	console.log('Server has initialized bot nickname. Nick: ' + bot_informations.username)
})

bot.command(['help', 'start'], ctx => {
	ctx.replyWithMarkdown(
		'Welcome to *Aalto Menu bot*.\n' +
		'You can even use the bot inline: try typing @aaltomenubot\n' +
		'The bot is open source, contribute https://github.com/albertoxamin/aalto-menu\n', extra = { disable_web_page_preview: true })
})


bot.on('callback_query', (ctx) => {
	let data = ctx.callbackQuery.data
	if (data.indexOf('menu_') != -1) {
		let id = data.split('_')[1]
		let obj = menus.filter(x => x.id == id)[0]
		if (obj) {
			ctx.replyWithHTML(msgCanteenMenu(obj), Markup.inlineKeyboard(
				[Markup.urlButton(`Allergens ℹ️`, `https://telegra.ph/Allergens-information-%E2%84%B9-09-30`)]
			).extra())
		} else {
			ctx.replyWithMarkdown(`*${canteens.filter(x => x.id == id)[0].name}* No menu for today!`)
		}
	}
})

var lastUnix = ''
var cachedMessage = ''
var canteens = []
var menus = []

const getCanteens = function (callback, date) {
	let m = moment().utcOffset(0)
	m.set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
	let todayUnix = m.unix().toString() + '000'
	if (todayUnix != lastUnix || date != undefined) {
		console.log('Update data ' + todayUnix + ' ' + lastUnix)
		lastUnix = todayUnix
		request(`https://kitchen.kanttiinit.fi/restaurants?lang=en&ids=1,2,3,5,7,8,41,45,50,51,52,59,64&priceCategories=student,studentPremium`, (err, response, body) => {
			if (err || response.statusCode != 200)
				return callback('Cannot connect to kanttiinit.fi!')
			canteens = JSON.parse(body)
			canteens = canteens.filter(y => y.openingHours[moment().isoWeekday() - 1] != null)
			let message = 'Open restaurants *today*:\n'
			canteens.forEach(canteen => {
				message += `${canteen.name}\t ${canteen.openingHours[moment().isoWeekday() - 1]}\n📍[Address](https://www.google.com/maps/search/?api=1&query=${canteen.address})\n\n`
			});
			cachedMessage = message
			let url = `https://kitchen.kanttiinit.fi/menus?lang=en&restaurants=${canteens.map(x => x.id)}&days=${moment().format("YYYY-MM-DD")}`
			request(url, (err, response, body) => {
				if (err || response.statusCode != 200)
					return callback('Cannot connect to kanttiinit.fi!')
				let data = JSON.parse(body)
				menus = []
				canteens.map(x => x.id).forEach(id => {
					menus.push({
						menu: data[`${id}`][`${moment().format("YYYY-MM-DD")}`],
						id: id
					})
				})
				callback(message)
			})
		})
	} else {
		callback(cachedMessage)
	}
}

bot.on('text', ctx => {
	ctx.replyWithChatAction('typing')
	getCanteens(res => ctx.replyWithMarkdown(res,
		Markup.inlineKeyboard(
			canteens.map(x => [Markup.callbackButton(x.name, 'menu_' + x.id)])
		).extra({ disable_web_page_preview: true })))
})

bot.on('inline_query', async ({ inlineQuery, answerInlineQuery }) => {
	console.log('Inline query received')
	getCanteens(() => {
		console.log('Menus available:' + menus.length)
		if (menus.length > 0) {
			let results = menus.filter(x => x.menu).map((x, i) => {
				let msg = msgCanteenMenu(x)
				return {
					type: 'article',
					id: crypto.createHash('md5').update(msg).digest('hex'),
					title: canteens.filter(y => y.id == x.id)[0].name,
					input_message_content: {
						message_text: msg,
						parse_mode: 'HTML',
					},
					reply_markup: Markup.inlineKeyboard([
						Markup.urlButton(`Allergens ℹ️`, `https://telegra.ph/Allergens-information-%E2%84%B9-09-30`)
					])
				}
			})
			answerInlineQuery(results,
				{
					switch_pm_text: 'Open restaurants today:',
					switch_pm_parameter: 'split'
				})
		}
		else {
			return answerInlineQuery([], {
				switch_pm_text: 'No open restaurants today.',
				switch_pm_parameter: 'split'
			})
		}
	}, undefined)
})

bot.catch((err) => {
	console.log('Ooops', err)
})

bot.startPolling()