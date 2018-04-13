/**
* @author Gaurav Nelson
* @copyright 2017 Gaurav Nelson
* @license MIT
* @module atom:asciidoc-reference-check
*/

"use strict";

//to read the file line by line
var readl = require('readl-async');

//to read files referenced by external refrences
var fs = require('fs');

//to convert ../ and / and ./ to absolute paths
var path = require('path');

var substring = 'xref:';

//Difference function to compare internal refrences stored in arrays
function difference(a1, a2) {
  var result = [];
  for (var i = 0; i < a1.length; i++) {
    if (a2.indexOf(a1[i]) === -1) {
      result.push(a1[i]);
    }
  }
  return result;
}

//To check for only uniqe values
function uniq(a) {
  var prims = {
    boolean: {},
    number: {},
    string: {},
  },
  objs = [];

  return a.filter(function (item) {
    var type = typeof item;
    if (type in prims)
    return prims[type].hasOwnProperty(item)
    ? false
    : (prims[type][item] = true);
    else return objs.indexOf(item) >= 0 ? false : objs.push(item);
  });
}

// add an anchor to the anchor array
// raise an error if the anchor was already defined
function registerAnchor(anchorArray, newAnchor) {
  if (anchorArray.includes(newAnchor)) {
    atom.notifications.addError(
      'Found duplicate anchors for `' + newAnchor + '`.',
      {
        dismissable: true
      }
    );
  } else {
    anchorArray.push(newAnchor);
  }
}

function getTreeViewPath() {
  if (!atom.packages.isPackageLoaded('tree-view')) {
    atom.notifications.addError('Cannot get reference to tree-view');
    return null;
  }

  var treeView = atom.packages.getLoadedPackage('tree-view');
  treeView = treeView.mainModule.treeView;
  return treeView.selectedPath;
}

module.exports = {
  activate: function () {
    atom.commands.add('atom-text-editor', {
      'asciidoc-reference-check:checkReferenceFromEditor': checkReferencesFromEditor,
    });
    atom.commands.add('.tree-view', {
      'asciidoc-reference-check:checkReferenceFromTreeViewFile': checkReferencesFromTreeViewFile,
    });
    atom.commands.add('.tree-view', {
      'asciidoc-reference-check:checkReferenceFromTreeViewFolder': checkReferencesFromTreeViewFolder,
    });
  },
};

function checkReferencesFromEditor(event) {
  var ref = atom.workspace.getActiveTextEditor();
  if (ref != null) {
    checkReferences(ref.getPath());
  } else {
    atom.notifications.addError('Cannot get reference to Atom Editor');
  }
}

function checkReferencesFromTreeViewFile(event) {
  checkReferences(getTreeViewPath());
}

function checkReferencesFromTreeViewFolder(event) {

  //walks recursively through the folder and returns file list
  var walk = function (dir) {
    var results = [];
    var list = fs.readdirSync(dir);
    list.forEach(function (file) {
      file = dir + '/' + file;
      var stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        /* Recurse into a subdirectory */
        results = results.concat(walk(file));
      } else {
        /* Is a file */
        var fileType = file.split('.').pop();
        if (fileType == 'adoc') {
          results.push(file);
        }
      }
    });

    return results;
  };

  var fileList = walk(getTreeViewPath());
  var numberFiles = fileList.length;

  for (var i = 0; i < numberFiles; i++) {
    checkReferences(fileList[i]);
  }
}

// check the references for the current file
function checkReferences(filePath) {

  //to ignore everything if it is commented out
  var insideCommentBlock = false;

  var allGood = true;

  var folderPath;

  //to hold anchors
  var anchorArray = [];

  //to hold internal references
  var internalRef = [];

  //to hold external links
  var externalLinks = [];

  //get directory
  folderPath = path.parse(filePath).dir;

  //console.log('Running for: ' + fileName);
  //console.log('Directory: ', folderPath)

  //lets read file contents line by line
  //we are not reading the file from editor, but instead the file from disk
  var reader = new readl(filePath, {
    encoding: 'utf8',
    emptyLines: 'true',
  });

  //Emit this function when one line is read:
  reader.on('line', function (line, index, start, end) {

    //detect start and end of code blocks
    if (line.startsWith('////')) {
      insideCommentBlock = !insideCommentBlock;
    }

    //ignore everything inside comment blocks
    if (insideCommentBlock) {
      return;
    }

    //ignore single line comments
    if (line.startsWith('//')) {
      return;
    }

    //find if line contains an anchor with format [[anchor]] or [[anchor, something]]
    if (line.match(/\[\[[^\]]+\]\]/g)) {
      var extractLink = line.match(/\[\[[^\]]+\]\]/g);
      //console.log('LINE: '+ line);
      //console.log('EXTRACT LINK: '+ extractLink);
      for (var i = 0; i < extractLink.length; i++) {
        var newAnchor = extractLink[i];
        newAnchor = newAnchor.replace('[[', '');
        newAnchor = newAnchor.replace(']]', '');
        newAnchor = newAnchor.replace(/,.*/g, ''); // take into account ','

        registerAnchor(anchorArray, newAnchor);

        //console.log('NEW ANCHOR with [[...]]: ' + newAnchor);
      }
    }

    //find if line contains an anchor with format [[[anchor]]] or [[[anchor, something]]]
    //this type of format of used for bibliography
    if (line.match(/^[ \t]*[\*\-]+[ \t]+\[\[\[[^\]]+\]\]\]/g)) {
      var extractLink = line.match(/\[\[\[[^\]]+\]\]\]/g);
      //console.log('LINE: '+ line);
      //console.log('EXTRACT LINK: '+ extractLink);
      for (var i = 0; i < extractLink.length; i++) {
        var newAnchor = extractLink[i];
        newAnchor = newAnchor.replace('[[[', '');
        newAnchor = newAnchor.replace(']]]', '');
        newAnchor = newAnchor.replace(/,.*/g, ''); // take into account ','

        registerAnchor(anchorArray, newAnchor);

        //console.log('NEW ANCHOR with [[[...]]]: ' + newAnchor);
      }
    }

    //find if line contains anchor with format [#anchorname] (Inline anchors)
    if (line.match(/(\[#)[^]*?\]/g)) {
      var extractLink = line.match(/(\[#)[^]*?\]/g);
      for (var i = 0; i < extractLink.length; i++) {
        var newAnchor = extractLink[i];
        newAnchor = newAnchor.replace('[#', '');
        newAnchor = newAnchor.replace(']', '');

        registerAnchor(anchorArray, newAnchor);
      }
    }

    //find if line contains anchor with format anchor:anchorname[]
    if (line.match(/(anchor:)[^]*?\]/g)) {
      var extractLink = line.match(/(:)[^]*?\[/g);
      for (var i = 0; i < extractLink.length; i++) {
        var newAnchor = extractLink[i];
        newAnchor = newAnchor.replace(':', '');
        newAnchor = newAnchor.replace('[', '');

        registerAnchor(anchorArray, newAnchor);
      }
    }

    //find internal and external references with format <<anchorname>> or <<anchorname, some text>>
    if (line.match(/<<[^\>]+>>/g)) {
      //console.log('LINE-----',line)
      var extractLink = line.match(/<<[^\>]+>>/g); //there may be more than one matching items
      for (var i = 0; i < extractLink.length; i++) {
        var newReference = extractLink[i];
        newReference = newReference.replace('<<', '');
        newReference = newReference.replace('>>', '');
        newReference = newReference.replace(/,.*/g, ''); // take into account ','

        //seperate internal and external refrences
        if (
          newReference.includes('.adoc') ||
          newReference.includes('#')
        ) {
          if (
            !newReference.includes('.adoc') &&
            newReference.includes('#')
          ) {
            //console.log('Before MOD: ', newReference);
            newReference = newReference.replace(/#/, '.adoc#');
            //console.log('After MOD: ', newReference);
          }
          // remaove the '#' if it is not followed by an anchor
          newReference = newReference.replace(/#$/, '');
          //external refrence
          externalLinks.push(path.resolve(folderPath, newReference));
        } else {
          //internal refrence
          internalRef.push(newReference);

          //console.log('INTERNAL LINK: ' + newReference);
        }
      }
    }

    if (line.match(substring)) {
      //find internal and external refrences with format xref:link[text]
      //console.log('LINE: ' + line);
      var tempLinksArr = line.match(/(xref:)[^]*?\[/g);
        //console.log('templinksarr: ' + tempLinksArr)
      for (var i = 0; i < tempLinksArr.length; i++) {
        var link = tempLinksArr[i];
        link = link.slice(5);
        link = link.slice(0, -1);

        //seperate internal and external refrences
        if (link.includes('.adoc')) {
          //external refrence
          externalLinks.push(path.resolve(folderPath, link));
        } else {
          //internal refrence
          internalRef.push(link);

          //console.log('INTERNAL LINK: ' + link);
        }
      }
    }
  });

  //Emit this function when the file is full read
  reader.on('end', function() {
    if (internalRef[0] != null) {
      //console.log(internalRefObj);
      internalRef = uniq(internalRef);
      //check internal refrences
      var isSuperset = internalRef.every(function(val) {
        return anchorArray.indexOf(val) >= 0;
      });
      //console.log('FOUND ALL? ' + isSuperset);
      if (!isSuperset) {
        var cannotFindInternal = difference(internalRef, anchorArray);
        cannotFindInternal.forEach(function(it) {
          //console.log('Cannot find the anchor: ' + it + ' in current file.');
          atom.notifications.addError(
            'Cannot find anchor: `' + it + '` in current file.',
            {
              dismissable: true
            }
          );
        });
      } else {
        atom.notifications.addSuccess(
          'All internal refrences are `OK`.'
        );
      }
    } else {
      atom.notifications.addSuccess(
        'This file does not have any internal refrences.'
      );
    }

    if (externalLinks[0] != null) {
      //check external refrences
      //get uniques so that we only check them once
      externalLinks = uniq(externalLinks);
      //console.log(externalLinks);

      function forEachPromise(externalLinks, fn) {
        return externalLinks.reduce(function(promise, item) {
          return promise.then(function() {
            return fn(item);
          });
        }, Promise.resolve());
      }

      function logItem(item) {
        //console.log('ITEM: ', item);
        return new Promise((resolve, reject) => {
          process.nextTick(() => {
            if (item.includes('#')) {
              var currentLink = item.split('#');
              var fullFilePath = currentLink[0];
              try {
                var data = fs.readFileSync(fullFilePath, 'utf8');
                if (currentLink[1] != undefined) {
                  if (data.indexOf('[[' + currentLink[1] + ']]') >= 0) {
                    //all good
                    //do nothing
                    //console.log('LINK FINE: ' + currentLink[1]);
                  } else {
                    // console.log(
                    //   '----------------------ERROR-----------------------'
                    // );
                    // console.log(
                    //   'Cannot find anchor!' +
                    //     currentLink[1] +
                    //     ' in file ' +
                    //     item
                    // );
                    allGood = false;
                    atom.notifications.addError(
                      'Cannot find the anchor: `' +
                      currentLink[1] +
                      '` in **' +
                      fullFilePath +
                      '**.',
                      {
                        dismissable: true
                      }
                    );
                  }
                }
              } catch (err) {
                //console.log('ERROR READING FILE', err);
                allGood = false;
                atom.notifications.addError(
                  'Cannot find the file: `' + fullFilePath + '`.',
                  {
                    dismissable: true
                  }
                );
              }
              resolve();
            } else {
              //console.log(item);
              var fullFilePath = item;
              try {
                var data = fs.readFileSync(fullFilePath, 'utf8');

                if (data) {
                  //all good
                  //do nothing
                  //console.log('LINK FINE: ' + currentLink[1]);
                } else {
                  //console.log('----------------------ERROR-----------------------')
                  //console.log('Cannot find anchor!' + currentLink[1] + ' in file ' + item);
                  allGood = false;
                  atom.notifications.addError(
                    'Cannot find the anchor: `' +
                    currentLink[1] +
                    '` in **' +
                    fullFilePath +
                    '**.',
                    {
                      dismissable: true
                    }
                  );
                }
              } catch (err) {
                //console.log('ERROR READING FILE', err);
                allGood = false;
                atom.notifications.addError(
                  'Cannot find the file: `' + fullFilePath + '`.',
                  {
                    dismissable: true
                  }
                );
              }
              resolve();
            }
          });
        });
      }

      forEachPromise(externalLinks, logItem).then(() => {
        if (allGood) {
          atom.notifications.addSuccess(
            'All external refrences are `OK`.'
          );
        }
      });
    } else {
      if (allGood) {
        atom.notifications.addSuccess('No external references found.');
      }
    }
  });

  //Emit this function when an error occurs
  reader.on('error', function(error) {
    //Do some stuff with the error
    // ....
  });

  //Start reading the file
  reader.read();

}
