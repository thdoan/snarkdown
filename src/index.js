const TAGS = {
  '': ['<em>', '</em>'],
  '_': ['<strong>', '</strong>'],
  '*': ['<strong>', '</strong>'],
  '~': ['<s>', '</s>'],
  '-': ['\n<hr>'],
  '=': ['\n<hr>'],
};

/** Outdent a string based on the first indented line's leading whitespace
 *  @private
 */
function outdent(str) {
  return str.replace(RegExp('^' + (str.match(/^(\t| )+/) || '')[0], 'gm'), '');
}

/** Encode special attribute characters to HTML entities in a string
 *  @private
 */
function encodeAttr(str) {
  return (str + '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Parse Markdown into an HTML string
export default function parse(md, prevLinks) {
  const tokenizer = /((?:^|\n+)(?:\n---+|\n===+|\* \*(?: \*)+)\n)|(?:^``` *(\w*)\n([\s\S]*?)\n```$)|((?:(?:^|\n+)(?:\t|  {2,}).+)+\n*)|((?:(?:^|\n)([>*+-]|\d+\.)\s+.*)+)|(?:!\[([^\]]*?)\]\(([^)]+?)\))|(\[)|(\](?:\(([^)]+?)\))?)|(?:(?:^|\n+)([^\s].*)\n(-{3,}|={3,})(?:\n+|$))|(?:(?:^|\n+)(#{1,6})\s*(.+)(?:\n+|$))|(?:`([^`].*?)`)|(  \n\n*|\n{2,}|__|\*\*|[_*]|~~)/gm;
  const context = [];
  const links = prevLinks || {};
  let out = '';
  let last = 0;
  let chunk, prev, token, inner, t;

  function tag(token) {
    const desc = TAGS[token[1] || ''];
    const end = context[context.length - 1] === token;
    if (!desc) return token;
    if (!desc[1]) return desc[0];
    if (end) context.pop();
    else context.push(token);
    return desc[end|0];
  }

  function flush() {
    let str = '';
    while (context.length) str += tag(context[context.length - 1]);
    return str;
  }

  md = md.replace(/^\[(.+?)\]:\s*(.+)$/gm, (s, name, url) => {
    links[name.toLowerCase()] = url;
    return '';
  }).replace(/^\n+|\n+$/g, '');

  while ((token = tokenizer.exec(md))) {
    prev = md.substring(last, token.index);
    last = tokenizer.lastIndex;
    chunk = token[0];
    if (prev.match(/[^\\](\\\\)*\\$/)) {
      // Escaped
    } else if (t = (token[3] || token[4])) {
      // Code/Indent blocks
      // Replace line breaks until post-processing
      chunk = '<pre><code>' + outdent(encodeAttr(t).replace(/^\n+|\n+$/g, '')).replace(/\n/g, '{{n}}') + '</code></pre>';
    } else if (t = token[6]) {
      // Quotes (>), Lists (-*)
      if (t.match(/\./)) {
        token[5] = token[5].replace(/^\d+/gm, '');
      }
      inner = parse(outdent(token[5].replace(/^\s*[>*+.-]/gm, '')));
      if (t === '>') {
        t = 'blockquote';
        // Replace line breaks until post-processing
        inner = inner.replace(/\n/g, '{{n}}');
      } else {
        t = t.match(/\./) ? 'ol' : 'ul';
        inner = inner.replace(/^(.*)(\n|$)/gm, '<li>$1</li>');
      }
      chunk = '\n<' + t + '>' + inner + '</' + t + '>';
    } else if (token[8]) {
      // Images
      chunk = '<img src="' + encodeAttr(token[8]) + '" alt="' + encodeAttr(token[7]) + '">';
    } else if (token[10]) {
      // Links
      out = out.replace('<a>', '<a href="' + encodeAttr(token[11] || links[prev.toLowerCase()]) + '" target="_blank">');
      chunk = flush() + '</a>';
    } else if (token[9]) {
      // Links
      chunk = '<a>';
    } else if (token[12] || token[14]) {
      // Headings
      t = 'h' + (token[14] ? token[14].length : (token[13]>'=' ? 1 : 2));
      chunk = '\n<' + t + '>' + parse(token[12] || token[15], links) + '</' + t + '>\n';
    } else if (token[16]) {
      // Code (`)
      chunk = '<code>' + encodeAttr(token[16]) + '</code>';
    } else if (token[17] || token[1]) {
      // Inline formatting (*...*, **...**, etc.)
      chunk = tag(token[17] || '--');
    }
    out += prev;
    out += chunk;
  }

  out = (out + md.substring(last) + flush()).replace(/^\n+|\n+$/g, '');

  // Post-process
  if (out.indexOf('<h') > -1) {
    // Add <p> tags (excluding: blockquote, hr, h1-6, ol, pre, ul)
    out = out.replace(/\n+((?!<(b|h|o|p|u)).+)/g, '\n<p>$1</p>');
    // Strip extra newlines
    out = out.replace(/\n{2,}/g, '\n');
    // Restore line breaks within <pre>
    out = out.replace(/{{n}}/g, '\n');
  }

  return out;
}
