const express = require('express');
const fs = require ('fs');
var Regex = require("regex");
const pg = require('./pg');
var flatten = require('flat')

var name;
var type;
var id;
//var tree = []; // Array instead of List to make work JSON Serializer on this object


function getItems(){
    try {
        /*  fs.readFile('C:\\Program Files (x86)\\ISS\\SecurOS\\securos.integrationserver.dbi', 'utf8', function(err, data) {
            if (err) throw err;
            //console.log(data);
            var values = regularExpression(data, /(OBJ_+\w+)/g);
            //values.forEach(element2 => {
                    //console.log(element2);
            //});
        });*/
            
            fs.readFile('C:\\Program Files (x86)\\ISS\\SecurOS\\integrations\\integrationserver.integration.json', 'utf8', async(err, data) => {

                if (err) throw err;
                    

                let parsedJson = JSON.parse(data);
                
                var elements = flatten({parsedJson})
                console.log(elements)
                //console.log(Object.values(elements).length)
                for (const element2 of Object.values(elements)) {
                    try{
                        var i = Object.values(elements).indexOf(element2);
                        console.log(element2, i);
                        if(i === 0){
                            ///COMPUTER or SERVER WHERE INTEGRATION POINT IS CREATED
                            var treeob = await ElementDB(element2, 0);
                            console.log('treeob',treeob)
                            console.log(treeob[treeob.length-1].parent_id)
                            var slave = await ElementDB("SLAVE", treeob[treeob.length-1].parent_id )
                            console.log('slave',slave[slave.length-1].name)
                        }
                        else{

                        }
                        
                        var treeob = await ElementDB(element2);
                        console.log('treeob',treeob)
                    }
                    catch (error) {
                        console.error(error);
                    }

                };

                //var treeob = await ReadJson(parsedJson);
                //console.log('treeob',treeob) 
                for(var a =0; a <= (parsedJson.structure.length-1) ; a++ ){

                    //console.log(Object.keys(parsedJson.structure)[a].length,Object.values(parsedJson.structure)[a])
                    //var parent = parsedJson.structure[]
                    //var treeob = selectObject(parsedJson.structure[a].type);
                    //var treeob = selectObject("OPC_SERVER");
                    
                    //var type = parsedJson.structure[a].type;
                    
                    //console.log(type, children)
                    //parsedJson.structure[]

                }
                       
    

                //return treeob;

                //readJson(data);

            });


        /*
        fs.readFile('C:\\Program Files (x86)\\ISS\\SecurOS\\securos.integrationserver.ddi', 'utf8', function(err, data) {
            if (err) throw err;
            datacompleta = datacompleta + data;
            console.log('OK');
            console.log(data);
        res.send(datacompleta);
        });*/
        /*const {id} = req.body; 
        pg.query("SELECT * FROM \"OBJ_INTEGRATION\" WHERE id = \'"+id+"\'", function(resp)
        {       
            console.log(resp.rows);
            res.send(resp.rows);
           
        });*/

    } catch (error) {
      console.error(error);
    }
};

function ElementDB(type, id){
    try 
    {
        if(id !== 0 ){
        return new Promise(resolve => {
            pg.query("SELECT * FROM \"OBJ_"+type+"\" WHERE id = \'"+id+"\'",  function(resp){
                var array = [];
                for(var b = 0; b < resp.rows.length ; b++ ){

                    var  aux = {'id':resp.rows[b].id, 'name': resp.rows[b].name, 'parent_id':resp.rows[b].parent_id }
                    array.push(aux)
                }   
                //console.log('array',array)
                resolve(array);
            })
        });

        }
        else{
        return new Promise(resolve => {
            pg.query("SELECT * FROM \"OBJ_"+type+"\"",  function(resp){
                var array = [];
                for(var b = 0; b < resp.rows.length ; b++ ){

                    var  aux = {'id':resp.rows[b].id, 'name': resp.rows[b].name, 'parent_id':resp.rows[b].parent_id }
                    array.push(aux)
                }   
                //console.log('array',array)
                resolve(array);
            })
        });

        }

    } catch (error) {
      console.error(error);
    }
  
};

function builtTree(){

    return new Promise(resolve => {

    });


}


function regularExpression(text, regexp){

    //var re = new RegExp(/(OBJ_+\w+)/g);
    var re = new RegExp(regexp);
    var r  = text.match(re);
    //console.log(r.length);
    r.forEach(element => {
            //console.log(element);
        });
    return r;
}


exports.getItems = getItems;
exports.regularExpression = regularExpression;
//exports.readJson =readJson;