/* @jsx React.createElement */
/* @jsxFrag React.Fragment */
const {test} = require('uvu')
const assert = require('uvu/assert')
import path from 'path'
import React from 'react'
import {renderToString} from 'react-dom/server'
import {transformAsync as babelTransform} from '@babel/core'
import mdxTransform from '../../mdx'
import {MDXProvider, withMDXComponents, mdx} from '../src'

const run = async value => {
  // Turn the serialized MDX code into serialized JSX…
  const doc = await mdxTransform(value, {skipExport: true})

  // …and that into serialized JS.
  const {code} = await babelTransform(doc, {
    configFile: false,
    plugins: [
      '@babel/plugin-transform-react-jsx',
      path.resolve(__dirname, '../../babel-plugin-remove-export-keywords')
    ]
  })

  // …and finally run it, returning the component.
  // eslint-disable-next-line no-new-func
  return new Function('mdx', `${code}; return MDXContent`)(mdx)
}

test('should evaluate MDX code', async () => {
  const Content = await run('# hi')

  assert.equal(renderToString(<Content />), '<h1>hi</h1>')
})

test('should evaluate some more complex MDX code (text, inline)', async () => {
  const Content = await run(
    '*a* **b** `c` <abbr title="Markdown + JSX">MDX</abbr>'
  )

  assert.equal(
    renderToString(<Content />),
    '<p><em>a</em> <strong>b</strong> <code>c</code> <abbr title="Markdown + JSX">MDX</abbr></p>'
  )
})

test('should evaluate some more complex MDX code (flow, block)', async () => {
  const Content = await run('***\n> * 1. a')

  assert.equal(
    renderToString(<Content />),
    '<hr/><blockquote><ul><li><ol><li>a</li></ol></li></ul></blockquote>'
  )
})

test('should warn on missing components', async () => {
  const Content = await run('<Component>x</Component>')
  const calls = []
  const warn = console.warn
  console.warn = (...parameters) => {
    calls.push(parameters)
  }

  assert.equal(renderToString(<Content />), '<p>x</p>')

  assert.equal(calls, [
    [
      'Component `%s` was not imported, exported, or provided by MDXProvider as global scope',
      'Component'
    ]
  ])

  console.warn = warn
})

test('should support components defined in MDX', async () => {
  const Content = await run('export const A = () => <b>!</b>\n\n<A />')

  assert.equal(renderToString(<Content />), '<b>!</b>')
})

test('should crash if weird values could come from JSX', async () => {
  // As JSX is function calls, that function can also be used directly in
  // MDX. Definitely not a great idea, but it’s an easy way to pass in funky
  // values.
  const Content = await run('{mdx(1)}')
  const error = console.error
  const calls = []
  console.error = (...parameters) => {
    calls.push(parameters)
  }

  assert.throws(() => {
    renderToString(<Content />)
  }, 'Element type is invalid')

  assert.equal(calls.length, 1)

  console.error = error
})

test('should support `components` with `MDXProvider`', async () => {
  const Content = await run('# hi')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          h1: props => <h1 style={{color: 'tomato'}} {...props} />
        }}
      >
        <Content />
      </MDXProvider>
    ),
    '<h1 style="color:tomato">hi</h1>'
  )
})

test('should support `wrapper` in `components`', async () => {
  const Content = await run('# hi')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          wrapper: props => <div id="layout" {...props} />
        }}
      >
        <Content />
      </MDXProvider>
    ),
    '<div id="layout"><h1>hi</h1></div>'
  )
})

test('should support dots in component names (such as `ol.li`) for a direct child “selector”', async () => {
  const Content = await run('* a\n1. b')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          'ol.li': props => <li className="ordered" {...props} />
        }}
      >
        <Content />
      </MDXProvider>
    ),
    '<ul><li>a</li></ul><ol><li class="ordered">b</li></ol>'
  )
})

test('should combine components in nested `MDXProvider`s', async () => {
  const Content = await run('# hi\n## hello')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          h1: props => <h1 style={{color: 'tomato'}} {...props} />,
          h2: props => <h2 style={{color: 'rebeccapurple'}} {...props} />
        }}
      >
        <MDXProvider
          components={{
            h2: props => <h2 style={{color: 'papayawhip'}} {...props} />
          }}
        >
          <Content />
        </MDXProvider>
      </MDXProvider>
    ),
    '<h1 style="color:tomato">hi</h1><h2 style="color:papayawhip">hello</h2>'
  )
})

test('should support components as a function', async () => {
  const Content = await run('# hi\n## hello')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          h1: props => <h1 style={{color: 'tomato'}} {...props} />,
          h2: props => <h2 style={{color: 'rebeccapurple'}} {...props} />
        }}
      >
        <MDXProvider
          components={_outerComponents => ({
            h2: props => <h2 style={{color: 'papayawhip'}} {...props} />
          })}
        >
          <Content />
        </MDXProvider>
      </MDXProvider>
    ),
    '<h1>hi</h1><h2 style="color:papayawhip">hello</h2>'
  )
})

test('should support a `disableParentContext` prop (sandbox)', async () => {
  const Content = await run('# hi')

  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          h1: props => <h1 style={{color: 'tomato'}} {...props} />
        }}
      >
        <MDXProvider disableParentContext={true}>
          <Content />
        </MDXProvider>
      </MDXProvider>
    ),
    '<h1>hi</h1>'
  )
})

test('should support `withComponents`', async () => {
  const Content = await run('# hi\n## hello')
  const With = withMDXComponents(props => {
    return <>{props.children}</>
  })

  // To do: should this use the `h2` component too?
  assert.equal(
    renderToString(
      <MDXProvider
        components={{
          h1: props => <h1 style={{color: 'tomato'}} {...props} />
        }}
      >
        <With
          components={{
            h2: props => <h2 style={{color: 'papayawhip'}} {...props} />
          }}
        >
          <Content />
        </With>
      </MDXProvider>
    ),
    '<h1 style="color:tomato">hi</h1><h2>hello</h2>'
  )
})

test.run()
