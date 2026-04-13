const securos = require('securos');
const express = require('express');
const router = express.Router();
const request = require('request');
const fs = require ('fs');
var Regex = require("regex");
const { triggerAsyncId } = require('async_hooks');
var TreeArray =[];

securos.connect( async function (core) {
    async function regularExpression(text, regexp){
        var re = new RegExp(regexp);
        var r  = text.match(re);
        if(r != null){
            r.forEach(element => {
            });
            return r;
        }
        else 
            return "";
    }

    router.get('/api/securos/', async (req,res) => {
    res.send('Connected to SecurOS External systems Api')
    });

    router.post('/api/securos/object', async (req,res) =>{
    const {type,id} = req.body; 

                let object = await core.getObject(type, id);
                res.send(object)

    
    });

    router.post('/api/securos/event', async (req,res) =>{
        var json = JSON.stringify(req.body);
        var parsedJson = JSON.parse(json);
        var SecurosComment = '', SecurosEvent  = '', SecurosRecType  = '',
        SecurosRecId  = '', SecurosParType  = '', SecurosParId  = '', SecurosPanelType  = '', SecurosPanelId  = '',
        SecurosSenType = '', SecurosSenId = '', type = '' , id = '' , Event = '' , comment = '' ;
        for (var keys in parsedJson) {

                switch (keys){
                    case "event_code":
                            SecurosComment = SecurosComment+ ' ' + parsedJson[keys];
                            break
                    case "comment":
                            SecurosComment = SecurosComment+ ' ' +parsedJson[keys];
                            break
                    case "event":
                            SecurosEvent = parsedJson[keys];
                            break
                    case "receiver":
                            SecurosRecType = "RECEIVER"
                            SecurosRecId = parsedJson[keys]
                        break
                    case "partition":
                            SecurosParType = "PARTITION"
                            SecurosParId = parsedJson[keys]
                        break
                    case "panel":
                            SecurosPanelType = "PANEL"
                            SecurosPanelId = parsedJson[keys]
                        break
                    case "sensor":
                            SecurosSenType = "SENSOR"
                            SecurosSenId = parsedJson[keys]
                        break
                    case "type":
                            type = parsedJson[keys]
                        break
                    case "typeID":
                            id = parsedJson[keys]
                        break

                }
        }
        //Priority
        comment = SecurosComment;
        Event = SecurosEvent;
        if (SecurosSenType != ''){
            type = SecurosSenType
            id = SecurosSenId

        }
        else if (SecurosParType != '' && SecurosSenType == ''){
            type = SecurosParType
            id = SecurosParId

        }
        else if (SecurosPanelType != '' && SecurosParType == '' && SecurosSenType == ''){
            type = SecurosPanelType
            id = SecurosPanelId

        }
        else if (SecurosRecType != '' && SecurosPanelType == '' && SecurosParType == '' && SecurosSenType == ''){
            type = SecurosRecType
            id = SecurosRecId

        }
        else if(type != '' && id != '' && SecurosRecType == '' && SecurosPanelType == '' && SecurosParType == '' && SecurosSenType == ''){
                type = type
                id = id
        }
       
            console.log(type,id,Event,comment )
            core.sendEvent(type,id,Event,{'comment':comment});

        
        res.send('ok')
    })

    router.get('/api/securos/item', async (req,res) =>{
        const {type} = req.body; 
        
            let objectsIds = await core.getObjectsIds(type);
            objectsIds.forEach(id => {
                    /*getObject
                    let object = await core.getObject(type, id);
                    try{
                        var json = JSON.stringify(object);
                        var parsedJson = JSON.parse(json);
                        if(parsedJson != null  && parsedJson != undefined)
                        {
                            console.log(parsedJson);
                        }
                    }catch(error){
                            console.error(error);
                    } */

            });
            res.send('ok')
        
        /*pg.query("SELECT * FROM \"OBJ_"+type+"\" WHERE id = \'"+id+"\'", function(resp)
        {       
            console.log(resp.rows);
            res.send(resp.rows);
        
        });*/
    });    

    router.get('/api/securos/allItems', async (req,res) =>{
        const {type,id} = req.body; 
        Items.getItems();
        res.send("OK");
    }); 


    router.get('/api/securos/items/area/:id', async (req,res) =>{

    const {type,id,action} = req.body;
       
            //GETCHILDRENcore.(type,id,action)
            //Construir json
            var json ;
            res.send(json)
        

    })

    router.post('/api/securos/react', async (req,res) =>{
        const {type,id,action} = req.body;
        
            core.doReact(type,id,action)

            res.send('ok')
        


    })


    async function promiseParent(tree, type, id) {
        var parent;
    return new Promise(async (resolve,reject) => {
    
            let object = await core.getObject(type, id);

        //try{
                var json = JSON.stringify(object);
                var parsedJson = JSON.parse(json);
                if(parsedJson != null  && parsedJson != undefined )
                {
                        if(parsedJson.type !=  'EXTERNAL_SYSTEMS' && parsedJson.type != 'INTEGRATION'){   
                                                        
                            parent = {
                                "name":  parsedJson.name,
                                "id": parsedJson.id,
                                "type": parsedJson.type
                            }   
                            console.log('tree', tree, parent)       
                            if(tree.parent != null && tree.parent != undefined){
                                    for (const element2 of Object.keys(tree.parent)) {
                                        console.log('element2', element2);
                                        if(element2 == 'parent' ){                                
                                            for (const element3 of Object.keys(tree.parent[element2])) {                                            
                                                console.log('element3', element3)   
                                                if(element3 == 'parent'){                                               
                                                    for (const element4 of Object.keys(tree.parent[element2].parent[element3])) {
                                                        console.log('element4',tree.parent[element2].parent[element3]);
                                                        if(element4 == 'parent'){
                                                            for (const element5 of Object.keys(tree.parent[element2].parent[element3].parent[element4])) {
                                                                console.log('element5', tree.parent[element2].parent[element3].parent[element4]);
                                                                if(element5 == 'parent'){
                                                                    console.log('element5.parent', tree)
                                                                }
                                                                else{
                                                                    
                                                                    if(tree.parent.parent.parent.parent.parent == undefined || tree.parent.parent.parent.parent.parent ==null ){
                                                                        tree.parent.parent.parent.parent.parent = parent;
                                                                        console.log('tree.parent.parent.parent.parent.parent', tree.parent.parent.parent.parent.parent)
                                                                        console.log('tree.', tree)
                                                                        break;
                                                                    } 
                                                                }
                                                            }
                                                        }
                                                        else{
                                                        
                                                            if(tree.parent.parent.parent.parent == undefined || tree.parent.parent.parent.parent ==null ){
                                                                    tree.parent.parent.parent.parent = parent;
                                                                    console.log('tree.parent.parent.parent.parent', tree.parent.parent.parent.parent)
                                                                    console.log('tree.', tree)
                                                                    break;

                                                            }                                                     
                                                        }
                                                    }
                                                }
                                                else{
                                                
                                                    if(tree.parent.parent.parent == undefined || tree.parent.parent.parent ==null ){
                                                        tree.parent.parent.parent = parent;
                                                        console.log('tree.parent.parent.parent', tree.parent.parent.parent)
                                                        console.log('tree.', tree)
                                                        break;
                                                    } 
                                                    
                                                }

                                        }  
                                        }
                                        else{
                                            
                                            if(tree.parent.parent == undefined || tree.parent.parent ==null){
                                                tree.parent.parent = parent; 
                                                console.log('tree.parent.parent', tree.parent.parent)
                                                console.log('tree.', tree)
                                                break;
                                            } 
                                        }                                

                                }    
                                }
                            else                        
                                    tree.parent = parent;   
                            console.log('ENTRO EN Promise', tree) 
                            if( parsedJson.type !=  'EXTERNAL_SYSTEMS' && parsedJson.parentType !=  'INTEGRATION'){
                                
                                    let object2 = await core.getObject(parsedJson.parentType, parsedJson.parentId);
                                    var json2 = JSON.stringify(object2);
                                    var parsedJson2 = JSON.parse(json2);                               
                                    if(parsedJson2 != null  && parsedJson2 != undefined)
                                    {
                                        setTimeout(function () {promiseParent(tree, parsedJson2.type,parsedJson2.id).then(newParent2 =>{
                                            resolve(tree);
                                        })}, 30)
                                    }
                               
                            }

                        }
                        else {
                            resolve('');
                        }                
                }
       
            
        });
    }

    async function eventHandlerReact(e){
        console.log('eventHandlerReact',e);
        console.log(JSON.stringify(e));
        var options = {
            'method': 'POST',
            'url': 'http://127.0.0.1:3035/api/securos/ThirdPartyReact',
            'headers': {
                'Content-Type': 'application/json'
            },         
            body: JSON.stringify(e)
            };
            request(options, function (error, response) {
            if (error) throw new Error(error);
            console.log(response.body);
            });
        
    }


    router.post('/api/securos/eventreact', async (req,res) =>{
        const {type,id,action} = req.body;
        var react = regularExpression(action, "\\w+(?=REACT)");
        TreeArray = {};
    
            let object = await core.getObject(type, id);
            try{
                    var json = JSON.stringify(object);
                    var parsedJson = JSON.parse(json);
                    if(parsedJson != null  && parsedJson != undefined)
                    {

                        if(parsedJson.Type !=  'EXTERNAL_SYSTEMS' && parsedJson.Type != 'INTEGRATION' && parsedJson.Type != 'SLAVE'  && parsedJson.Type != 'MAIN'){
                            
                            TreeArray.react = react[0];
                            TreeArray.name =  parsedJson.name;
                            TreeArray.id =  parsedJson.id;
                            TreeArray.type = parsedJson.type;
                        }
                    }
                    promiseParent(TreeArray, parsedJson.parentType, parsedJson.parentId).then( newParent =>{  
                        console.log('newParent del post', newParent);                          
                            res.send(newParent);
                            eventHandlerReact(newParent);
                    })              
                    
            }  
            catch(error){
                    console.error(error);
                    res.send('ERROR');   
            }       
    
    })

});


module.exports = router;