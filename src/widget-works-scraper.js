import load from './cheerio/ext'
import url from 'url'

// "2015年12月25日 10:30"という形式の文字列をDateオブジェクトにする
function parseDate (str) {
  const m = str.match(/^(\d+)年(\d+)月(\d+)日 (\d+):(\d+)$/)
  if (!m) throw new Error(`Invalid date string: ${str}`)
  let [year, month, day, hour, minute] = m.slice(1).map((n) => parseInt(n, 10))
  month-- // monthは0から始まる
  return new Date(year, month, day, hour, minute)
}

// "1,234,567"という形式の文字列を123456という数値にする
function parseSeparatedDecimal (str) {
  return parseInt(str.replace(/,/g, ''), 10)
}

// "/users/kaku-yomu"という形式の文字列を"kakuyomu"にする
function parseUserUrl (str) {
  const u = url.parse(str)
  const m = u.pathname.match(/^\/users\/([-_0-9a-zA-Z]+)$/)
  if (!m) throw new Error(`Invalid user URL: ${str}`)
  return m[1]
}

function scrapeUserNode ($node) {
  return {
    name: $node.textrim(),
    userId: parseUserUrl($node.attr('href'))
  }
}

export default class Scraper {
  constructor (html) {
    this.$ = load(html)
  }

  * getItems () {
    const itemSelector = '.widget-media-genresWorkList .widget-work[itemtype="https://schema.org/CreativeWork"]'
    for (const that of this.$(itemSelector).get()) {
      yield this.scrapeWorkNode(this.$(that))
    }
  }

  scrapeWorkNode ($work) {
    const work = {}
    const self = this
    work.name = $work.fetchAt('[itemprop="name"]').textrim()
    work.workId = $work.fetchAt('[itemprop="name"]').attr('href').match(/^\/works\/(\d+)$/)[1] // Number型だとオーバーフローする
    work.author = scrapeUserNode($work.fetchAt('[itemprop="author"]'))
    work.reviewPoints = parseSeparatedDecimal($work.fetchAt('.widget-work-reviewPoints').textrim().match(/^★([\d,]+)$/)[1])
    work.genre = $work.fetchAt('[itemprop="genre"]').textrim()
    work.status = $work.fetchAt('.widget-work-statusLabel').textrim()
    work.episodeCount = parseSeparatedDecimal($work.fetchAt('.widget-work-episodeCount').textrim().match(/^([\d,]+)話$/)[1])
    work.characterCount = parseSeparatedDecimal($work.fetchAt('[itemprop="characterCount"]').textrim().match(/^([\d,]+)文字$/)[1])
    work.dateModified = parseDate($work.fetchAt('[itemprop="dateModified"]').textrim().match(/^(.+) 更新$/)[1])
    work.introductionSnippet = $work.findAt('.widget-work-introduction').textrim() || null
    work.flags = $work.find('.widget-work-flags [itemprop="keywords"]')
      .map(function () { return self.$(this).textrim() }).get()
    work.keywords = $work.find('.widget-work-tags [itemprop="keywords"]')
      .map(function () { return self.$(this).textrim() }).get()
    work.firstEpisodeId = $work.findAt('.widget-work-buttons a[href^="/works"][href*="/episodes/"]').attr('href').match(/^\/works\/\d+\/episodes\/(\d+)$/)[1] || null
    work.reviews = $work.find('[itemtype="https://schema.org/Review"]')
      .map(function () {
        const $review = self.$(this)
        return {
          // <a>にはitemprop="name"がないのでhrefを使う
          author: scrapeUserNode($review.fetchAt('a[href^="/users/"]')),

          body: $review.fetchAt('[itemprop="reviewBody"]').textrim()
        }
      }).get()
    work.imageColor = (() => {
      // イメージカラーは必ず設定されているはずだが、レビューがないと小説一覧からは取得できない
      const $review = $work.findAt('[itemtype="https://schema.org/Review"] [style*=color]')
      if ($review.length) {
        const m = $review.attr('style').match(/color:\s*([^;]+)/)
        if (m && m[1]) {
          return m[1]
        }
      }
      return null
    })()
    return work
  }
}