/*
MIT License

Copyright (c) 2017 Hasan Altan Birler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

function staticsearch(htmlnode, 
	textelements=["a","span","link","nav","caption","thead",
		"#text","h1","h2","h3","h4","h5","h6",
		"abbr","address","b","bdi","bdo","blockquote",
		"cite","code","del","dfn","em","i","ins","kbd",
		"mark","meter","pre","progress","q","rp","rt",
		"ruby","s","samp","small","strong","sub","time",
		"u","var","wbr","label"]) {
	class VNode {
		constructor(htmlnode, nofilter = false) {
			this.origdisplay = htmlnode.style.display;
			this.preactive = true;
			this.active = true;
			this.htmlnode = htmlnode;
			this.children = [];
			this.textchildren = [];
			
			if (nofilter) {
				this.nofilter = true;
			} else {
				this.nofilter = htmlnode.hasAttribute("data-ss-nofilter");
			}
			this.additional = [];
			this.forceadditional = [];
		}
		
		addChild(htmlnode) {
			const newnode = new VNode(htmlnode);
			this.children.push(newnode);
			return newnode;
		}
	}
	
	class TextVNode {
		constructor(htmlnode, parenthtmlnode, nofilter = false) {
			this.preactive = true;
			this.active = true;
			this.htmlnode = htmlnode;
			this.parenthtmlnode = parenthtmlnode;
			this.data = htmlnode.nodeValue;
			
			this.nofilter = nofilter;
		}
	}
	
	const treeroot = new VNode(htmlnode)
	
	function isTextNode(htmlnode) {
		return textelements.includes(htmlnode.nodeName.toLowerCase());
	}
	
	//Creates the initial VNode tree by traversing DOM
	function createTraverse(vnode, htmlnode, nofilter = false) {
		nofilter = nofilter || vnode.nofilter;
		
		if (htmlnode.hasAttribute("data-ss-additional"))
			vnode.additional.push(htmlnode.getAttribute("data-ss-additional"));
		if (htmlnode.hasAttribute("data-ss-forceadditional"))
			vnode.forceadditional.push(htmlnode.getAttribute("data-ss-forceadditional"));
		
		for (const cnode of htmlnode.childNodes) {
			if (isTextNode(cnode)) {
				if (cnode.nodeName === "#text") {
					vnode.textchildren.push(new TextVNode(cnode, htmlnode, nofilter));
				}
				else {
					const nocfilter = nofilter || cnode.hasAttribute("data-ss-nofilter");
					createTraverse(vnode, cnode, nocfilter);
				}
			}
			else {
				const childvnode = vnode.addChild(cnode);
				createTraverse(childvnode, cnode, nofilter);
			}
		}
	}
	
	createTraverse(treeroot, htmlnode);
	
	return {
		root: treeroot,
		filter: function(pattern) {
			class MarkerAction {
				constructor(parent, prenode, newnode) {
					this.parent = parent;
					this.prenode = prenode;
					this.newnode = newnode;
				}
			}
			
			class DisplayAction {
				constructor(vnode, newdisplay) {
					this.vnode = vnode;
					this.newdisplay = newdisplay;
				}
			}
			
			function transformPattern(pattern) {
				return pattern.toLowerCase();
			}
			
			function transformStr(str) {
				return str.toLowerCase().trim();
			}
			
			function arrayIncludes(arr, pattern) {
				pattern = transformPattern(pattern);
				for (let str of arr) {
					str = transformStr(str);
					if (str.includes(pattern))
						return true;
				}
				return false;
			}
			
			function getIndices(pattern, str) {
				const retval = [];
				if (pattern == "") return retval;
				pattern = transformPattern(pattern);
				str = transformStr(str);
				for (let i = str.indexOf(pattern, 0); i >= 0; i = str.indexOf(pattern, i+1))
					retval.push(i);
				return retval;
			}
			
			//Creates a #text replacement element that replaces pattern with mark tags
			function createMarkedElement(text, pattern, indices) {
				if (pattern == "" || indices.length === 0)
					return document.createTextNode(text);
				
				const retval = document.createElement("span");
				
				let preind = 0;
				for (const ind of indices) {
					retval.appendChild(document.createTextNode(text.slice(preind, ind)));
					const markelement = document.createElement("mark");
					markelement.appendChild(document.createTextNode(text.slice(ind, ind + pattern.length)));
					retval.appendChild(markelement);
					preind = ind + pattern.length;
				}
				retval.appendChild(document.createTextNode(text.slice(preind, text.length)));
				
				return retval;
			}
			
			
			
			const markeractions = []
			//Checks for changes in #text elements and creates MarkerActions
			//Updates whether nodes should be displayed
			function computeActive(pattern, mactions, vnode, forcedisplay = false) {
				vnode.preactive = vnode.active;
				vnode.active = forcedisplay;
				
				const forceadditionalcont = arrayIncludes(vnode.forceadditional, pattern);
				const additionalcont = forceadditionalcont || arrayIncludes(vnode.additional, pattern);
				
				if (additionalcont)
					vnode.active = true;
				
				if (forceadditionalcont)
					forcedisplay = true;
				
				for (const tvnode of vnode.textchildren) {
					if (tvnode.nofilter)
						continue;
					
					tvnode.preactive = tvnode.active;
					indices = getIndices(pattern, tvnode.data);
					tvnode.active = pattern === "" || indices.length > 0;
					
					if (tvnode.preactive === true || (tvnode.active === true && pattern !== "")) {
						const newnode = createMarkedElement(tvnode.data, pattern, indices);
						const myaction = new MarkerAction(tvnode.parenthtmlnode, tvnode.htmlnode, newnode);
						tvnode.htmlnode = newnode;
						mactions.push(myaction);
					}
					if (tvnode.active) vnode.active = true;
				}
				
				for (const cvnode of vnode.children) {
					computeActive(pattern, mactions, cvnode, forcedisplay);
					if (cvnode.active) vnode.active = true;
				}
			}
			computeActive(pattern, markeractions, this.root);
			
			const displayactions = [];
			//Computes the DisplayActions
			//Hide nodes higher in the tree with highest priority
			//Display nodes lower in the tree with high priority
			function computeActions(dactions, vnode) {
				if (vnode.preactive === true && vnode.active === false)
					dactions.push(new DisplayAction(vnode, vnode.active));
				
				for (const cvnode of vnode.children) {
					computeActions(dactions, cvnode);
				}
				
				if (vnode.preactive === false && vnode.active === true)
					dactions.push(new DisplayAction(vnode, vnode.active));
			}
			computeActions(displayactions, this.root);
			
			//Apply the DisplayActions (hide and display nodes)
			for (const dact of displayactions) {
				if (dact.newdisplay) {
					dact.vnode.htmlnode.style.display = dact.vnode.origdisplay;
				} else {
					dact.vnode.htmlnode.style.display = "none";
				}
			}
			
			//Apply the MarkerActions (add and remove mark tags)
			for (const mact of markeractions) {
				mact.parent.replaceChild(mact.newnode, mact.prenode);
			}
		}
	};
}