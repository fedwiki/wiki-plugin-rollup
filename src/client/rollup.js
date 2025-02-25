/*
 * Federated Wiki : Rollup Plugin
 *
 * Licensed under the MIT license.
 * https://github.com/fedwiki/wiki-plugin-rollup/blob/master/LICENSE.txt
 */

window.plugins.rollup = {
  emit: (div, item) => {},
  bind: (div, item) => {
    div.on('dblclick', () => wiki.textEditor(div, item))

    div.append(`
      <style>
        td.material {overflow:hidden;}
        td.score {text-align:right; width:25px}
      </style>
    `)

    const asValue = obj => {
      if (obj == null) return NaN
      switch (obj.constructor) {
        case Number:
          return obj
        case String:
          return +obj
        case Array:
          return asValue(obj[0])
        case Object:
          return asValue(obj.value)
        case Function:
          return obj()
        default:
          return NaN
      }
    }

    const attach = search => {
      wiki.log('attach', wiki.getDataNodes(div))
      for (const elem of wiki.getDataNodes(div)) {
        wiki.log('attach loop', $(elem).data('item').text)
        const source = $(elem).data('item')
        if (source.text.indexOf(search) >= 0) {
          return source
        }
      }
      throw new Error(`can't find dataset with caption ${search}`)
    }

    const reference = attach('Materials Summary')

    const display = (calculated, state) => {
      const row = state.row
      const $row = state.$row
      for (const col of reference.columns) {
        if (col == 'Material') {
          const label = wiki.resolveLinks(`[[${row.Material}]]`)
          if (calculated) {
            if (state.errors.length > 0) {
              const errors = state.errors.map(e => e.message.replace(/"/g, "'")).join('\n')
              $row.append(`<td class="material">${label} <span style="color:red;" title="${errors}">✘</span></td>`)
            } else {
              $row.append(`<td class="material">${label}</td>`)
            }
          } else {
            $row.append(`<td class="material">${label}</td>`)
          }
        } else {
          const old = asValue(row[col])
          const now = asValue(state.input[col])
          if (calculated && now != null) {
            const color =
              old.toFixed(4) == now.toFixed(4) ? 'green' : old.toFixed(0) == now.toFixed(0) ? 'orange' : 'red'
            const title = `${row.Material}\n${col}\nold ${old.toFixed(4)}\nnow ${now.toFixed(4)}`
            $row.append(
              `<td class="score" title="${title}" data-thumb="${col}" style="color:${color};">${old.toFixed(0)}</td>`,
            )
          } else {
            const title = `${row.Material}\n${col}\n${old.toFixed(4)}`
            $row.append(`<td class="score" title="${title}" data-thumb="${col}">${old.toFixed(0)}</td>`)
          }
        }
      }
    }

    const perform = (state, plugin, done) => {
      if (state.methods.length > 0) {
        plugin.eval(state, state.methods.shift(), state.input, (state, output) => {
          state.output = output
          Object.assign(state.input, output)
          perform(state, plugin, done)
        })
      } else {
        return done(state)
      }
    }

    const timeout = (delay, done) => {
      setTimeout(done, delay)
    }

    const recalculate = (delay, state, done) => {
      timeout(delay, () => {
        wiki.getPlugin('method', plugin => {
          $.getJSON(`/${state.slug}.json`, data => {
            state.methods = data.story.filter(item => item.type == 'method')
            perform(state, plugin, done)
          })
        })
      })
    }

    const radar = (input = {}) => {
      const candidates = $(`.item:lt(${$('.item').index(div)})`)
      const output = Object.assign({}, input)
      for (let elem of candidates) {
        elem = $(elem)
        if (elem.hasClass('radar-source')) {
          Object.assign(output, elem.get(0).radarData())
        } else if (elem.hasClass('data')) {
          Object.assign(output, elem.data('item').data[0])
        }
      }
      return output
    }

    const reindex = results => {
      wiki.log('reindex', results)
      const sorted = results.sort((a, b) => asValue(b.input['Total Score']) - asValue(a.input['Total Score']))
      sorted.forEach((state, index) => {
        state.input.Rank = `${index + 1}`
      })
      results.forEach(state => {
        state.$row.empty()
        display(true, state)
      })
    }

    const $table = $(`<table/>`)
    div.append($table)
    const rows = reference.data.sort((a, b) => -asValue(b['Total Score']) - -asValue(a['Total Score']))
    let delay = 0
    const results = []
    let remaining = rows.length
    for (const row of rows) {
      const slug = wiki.asSlug(row.Material)
      const $row = $(`<tr class="${slug}">`)
      $table.append($row)
      const state = { $row, row, slug, input: radar(), errors: [] }
      display(false, state)
      delay += 200
      recalculate(delay, state, state => {
        state.$row.empty()
        state.input.Rank = state.row.Rank
        display(true, state)
        results.push(state)
        remaining -= 1
        if (!remaining) reindex(results)
      })
    }
  },
}
