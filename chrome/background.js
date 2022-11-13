/* eslint-disable prefer-destructuring */
/* global chrome */

// Define root folder for searches
const FOLDER_NAME = 'Searches';

const searchLibs = [];

// Get ID of FOLDER_NAME and the object and pass everything through listBookmarksInTree:
function main() {
  chrome.bookmarks.search({ title: FOLDER_NAME }, (bookmarks) => {
    if (bookmarks.length > 0) {
      const subTreeID = bookmarks[0].id;

      chrome.bookmarks.getSubTree(subTreeID, (bookmarkItems) => {
        if (bookmarkItems[0].children.length > 0) {
          listBookmarksInTree(bookmarkItems[0], subTreeID);
        } else { // No root folder found: Show "Getting Started" help link
          // createHelpLink();
        }
      });
    } else { // No root folder found: Show "Getting Started" help link
      // createHelpLink();
    }
  });
}

// Parse through all bookmarks in tree and fire populateContextMenu for each:
function listBookmarksInTree(bookmarkItem, subTreeID) {
  if (bookmarkItem.url && (bookmarkItem.url.match('%s') || bookmarkItem.url.match(/%(rawText|eacapedText)%/))) { // TODO
    let keyword = bookmarkItem.title.match(/\(&(.*?)\)/);
    keyword = keyword ? keyword[1] : '';
    const host = new URL(bookmarkItem.url).hostname.replace(/^www\./, '');
    if (!keyword) {
      keyword = host;
    } else if (searchLibs.filter((i) => i.keyword === keyword).length) {
      keyword = `${keyword}-${host}`;
    }
    searchLibs.push({
      id: bookmarkItem.id,
      title: bookmarkItem.title,
      keyword,
      url: bookmarkItem.url,
    });
  }

  if (bookmarkItem.children) {
    for (const child of bookmarkItem.children) {
      listBookmarksInTree(child, subTreeID);
    }
  }
}

function reGenerateList() {
  main();
}

chrome.bookmarks.onCreated.addListener(reGenerateList);
chrome.bookmarks.onRemoved.addListener(reGenerateList);
chrome.bookmarks.onChanged.addListener(reGenerateList);
chrome.bookmarks.onMoved.addListener(reGenerateList);

main();

function searchLibsFilter(keyword) {
  return searchLibs.filter((i) => i.keyword.includes(keyword) || i.title.includes(keyword) || i.url.includes(keyword)).sort((a, b) => {
    const ka = a.keyword;
    const kb = b.keyword;
    const kai = ka.indexOf(keyword);
    const kbi = kb.indexOf(keyword);
    if (kai < kbi && kai >= 0) { // 比较关键词中所在位置
      return -1;
    } if (kai > kbi && kbi >= 0) {
      return 1;
    } if (kai === kbi && kai >= 0) {
      /* noop */
    } else if (kai < 0 && kbi < 0) {
      /* noop */
    } else if (kai >= 0 && kbi < 0) {
      return -1;
    } else if (kai < 0 && kbi >= 0) {
      return 1;
    }

    if (ka.length < kb.length) { // 比较关键词长度
      return -1;
    } if (ka.length > kb.length) {
      return 1;
    }

    const ta = a.title;
    const tb = b.title;
    if (ta.match(/^\[(\d+)\]/) || tb.match(/^\[(\d+)\]/)) { // 比较使用次数
      const na = ta.match(/^\[(\d+)\]/) ? ta.match(/^\[(\d+)\]/)[1] * 1 : 0;
      const nb = tb.match(/^\[(\d+)\]/) ? tb.match(/^\[(\d+)\]/)[1] * 1 : 0;
      if (na > nb) {
        return -1;
      } if (na < nb) {
        return 1;
      }
    }

    return ka < kb ? -1 : ka === kb ? 0 : 1; // 比较关键词
  });
}

function htmlEscape(text) {
  return text.replace(/["&<>]/g, (match) => ({
    '"': '&quot;',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  }[match]));
}

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  let [, keyword, input] = text.match(/^(.*?)(\s.*$|$)/);
  input = input.trim();
  const libs = searchLibsFilter(keyword);
  if (libs.length === 0) return suggest([]);
  const lists = libs.map((i) => ({
    content: `${i.keyword} ${input}`,
    description: `<dim>使用</dim> <url>${htmlEscape(i.title)}</url> <dim>搜索</dim>: <match>${htmlEscape(input)}</match>`,
    deletable: true,
  }));
  return suggest(lists);
});

let bmLast = null;
chrome.omnibox.onInputEntered.addListener((text) => {
  let [, keyword, input] = text.match(/^(.*?)(\s+.*$|$)/);
  input = input.trim();
  const libs = searchLibsFilter(keyword);
  let bm;
  if (libs.length === 0) {
    if (!bmLast) return;
    bm = bmLast;
    input = `${keyword} ${input}`.trim();
  } else {
    bm = libs[0];
  }
  bmLast = bm;
  chrome.tabs.update({ url: getUrl(input, bm.url) });
  // updateBookmarkTimes(bm.id, bm.title)
});

function getUrl(text, template) { // TODO
  // %s
  // %(rawText|eacapedText)%
  return template
    .replace('%s', encodeURIComponent(text))
    .replace('%rawText%', text)
    .replace('%eacapedText%', escape(text));
}
