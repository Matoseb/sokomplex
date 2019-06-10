import c4d
import json
import math
import os
import collections
from collections import OrderedDict
#user data button

c4d._Ocloner = 1018544

def main():
    
    obj = op.GetObject()
    
    #add button listener
    if not obj.FindEventNotification(doc, op, c4d.NOTIFY_EVENT_MESSAGE):
        obj.AddEventNotification(op, c4d.NOTIFY_EVENT_MESSAGE, 0, c4d.BaseContainer())
    
    pass

def message(msg_type, data):
    
    try:
        if msg_type == c4d.MSG_NOTIFY_EVENT:
            event_data = data['event_data']
            
            #print event_data['msg_id']
            
            
            if event_data['msg_id'] == c4d.MSG_ENABLE_DELAY_EFFECTOR:
                
                
                
                active = doc.GetActiveObject()
                if active.GetType() == c4d._Ocloner:
                    active[c4d.ID_MG_TRANSFORM_POSITION]=(active[c4d.MG_GRID_RESOLUTION]-1)*.5
                
                    
            elif event_data['msg_id'] == c4d.MSG_DESCRIPTION_COMMAND:
                #check if good button
                
                if event_data['msg_data']['id'][1].id == 4:
                    datas = getData()
                    saveFile(datas["chunks"], "chunks")
                    saveFile(datas["worldInfo"], "worldinfo")
                    print("saved")
                    #print strDatas
    
    except:
        pass
        
def setUpKeys(xKeys, yKeys, zKeys):
    
    x = xKeys[1]
    x_offset = xKeys[0]
    x_right = len(x)-x_offset

    y = yKeys[1]
    y_offset = yKeys[0]
    y_right = len(y)-y_offset

    z = zKeys[1]
    z_offset = zKeys[0]
    z_right = len(z)-z_offset

    right = max(x_right, y_right, z_right)
    left = max(x_offset, y_offset, z_offset)

    arr_x = [x[0]]*(left-x_offset) + x + [x[-1]]*(right-x_right)
    arr_y = [y[0]]*(left-y_offset) + y + [y[-1]]*(right-y_right)
    arr_z = [z[0]]*(left-z_offset) + z + [z[-1]]*(right-z_right)

    arr = []
    for i in range(len(arr_x)):
        arr.append([arr_x[i], arr_y[i], arr_z[i]])

    return (left, arr)


def offsetKeys(obj, track, offset, fallback):
    curve = track.GetCurve()
    
    keys = []
    index = 0
    oldTime = 0
    
    for j in xrange(curve.GetKeyCount()):
        key = curve.GetKey(j)
        time = key.GetTime().GetFrame(doc.GetFps())
        value = trueInt(key.GetValue() + offset)
        added = [value]
        
        if keys:
            added = [keys[-1]] * (time - oldTime)
            added[-1] = value
        else:
            index = -time
            
        oldTime = time
            
        key.SetValue(curve, value)
        keys.extend(added)
    
    if len(keys) == 0:
        return fallback
    
    return (index, keys)

def getTimelineFrames(obj):
    tracks = obj.GetCTracks()
    
    if not tracks:
        return []

    posx = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_X)
    posy = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_Y)
    posz = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_Z)
    
    pos = obj[c4d.ID_BASEOBJECT_REL_POSITION]
    kx = (0, [trueInt(pos.x)])
    ky = (0, [trueInt(pos.y)])
    kz = (0, [trueInt(pos.z)])
    
    
    for t in tracks:
        tid = t.GetDescriptionID()
        if   DescID_Equals(tid, posx):
            kx = offsetKeys(obj, t, 0, kx)
           
        elif DescID_Equals(tid, posy):
            ky = offsetKeys(obj, t, 0, ky)
            
        elif DescID_Equals(tid, posz):
            kz = offsetKeys(obj, t, 0, kz)
    
    c4d.EventAdd()
    
    return setUpKeys(kx, ky, kz)
    

def moveFrames(obj, offsets):
    tracks = obj.GetCTracks()
    
    if not tracks:
        return

    posx = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_X)
    posy = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_Y)
    posz = DescID(c4d.ID_BASEOBJECT_REL_POSITION, c4d.VECTOR_Z)
    
    tx = None
    ty = None
    tz = None
    
    
    for t in tracks:
        tid = t.GetDescriptionID()
        
        if   DescID_Equals(tid, posx): offsetKeys(obj, t, offsets.x)
        elif DescID_Equals(tid, posy): offsetKeys(obj, t, offsets.y)
        elif DescID_Equals(tid, posz): offsetKeys(obj, t, offsets.z)
        
    c4d.EventAdd()
        
def saveFile(datas, name): 
    datas = stringify(datas)
    datafile = open(os.path.dirname(doc.GetDocumentPath())+"/"+name+".txt", "w")
    datafile.write(datas)
    datafile.close()
    
    return datas

def getChunksize():
    obj = op.GetObject()
    chunk = {
        "chkX":obj[c4d.ID_USERDATA, 1],
        "chkY":obj[c4d.ID_USERDATA, 2],
        "chkZ":obj[c4d.ID_USERDATA, 3],
    }
    
    return chunk

def DescID(*subids):
    return c4d.DescID(*[c4d.DescLevel(id) for id in subids])

def DescID_Equals(id1, id2):
    nD1 = id1.GetDepth()
    nD2 = id2.GetDepth()
    if nD1 != nD2:
        return False
    for i in xrange(nD1):
        if id1[i].id != id2[i].id:
            return False
    return True

def getKeyFrames(obj):
    
    (index, timeline) = getTimelineFrames(obj)
    
    idTimeline = []

    for j, curr in enumerate(timeline):
        _next = timeline[(j+1)%len(timeline)]
        idTimeline.append(getTransformId([_next[0]-curr[0], _next[1]-curr[1], _next[2]-curr[2]]))
    
    return {"index": index, "keys": idTimeline}

def getTransformId(pos):
    n = pos[0] + pos[1]*2 + pos[2]*3
    if n < 0: n+=7
    return n

def setLevelInfo(obj, levels):
    
    level = obj.GetLayerObject(doc)
    
    if level:
        
        pos = obj[c4d.ID_BASEOBJECT_REL_POSITION]
        x = trueInt(pos.x)
        y = trueInt(pos.y)
        z = trueInt(pos.z)
        
        level = int(level.GetName())
        
        c = levels.get(level)
        if c is None:
            levels[level] = {'x':x ,'X':x, 'y':y,'Y':y, 'z':z, 'Z': z}
        else:
            c['x'] = min(c['x'], x, key=float)
            c['X'] = max(c['X'], x, key=float)
            c['y'] = min(c['y'], y, key=float)
            c['Y'] = max(c['Y'], y, key=float)
            c['z'] = min(c['z'], z, key=float)
            c['Z'] = max(c['Z'], z, key=float)
        
        
    else:
        level = 0
    
    return level

def getBlockType(obj, chunkDims, boxes, levels):
    name = obj.GetName()
    specs = []
    block_type = 0  #default is wall
    
    
    level = setLevelInfo(obj, levels)

    if "wall" in name:
        _type = 0
        specs = [level]
    elif "player" in name:
        _type = 1
        force = 1
        specs = [level,_type, force]
    elif "box" in name:
        
        _type = 2
        
        states = {"goal": 3 ,"push_button": 4 ,"toggle_button": 5 }
        state = 2
        specs = [level,_type, state]
        boxes.append([specs, obj])
    elif "goal" in name:
        #levels[level]['f'] = levels[level].get('f') or getButtons(obj, chunkDims) or 0 #to change
        levels[level]['s'] = levels[level].get('s') or obj[c4d.ID_USERDATA,3]  #is hidden 1, not hidden 0
        
        _type = 3
        
        specs = [level,_type]
    elif "push_button" in name:
        
        _type = 4
        specs = [level,_type]
        
    elif "toggle_button" in name:
        _type = 5
        state = 0
        specs = [level,_type, state]
    elif "door" in name:
        _type = 6
        frames = getKeyFrames(obj)
        
        buttons = getButtons(obj, chunkDims)
        
        #inverted = 0
        
        specs = [level,_type, buttons, frames["index"], frames["keys"]]
    else:
        print "\"%s\" is not a defined type of block." % (name)

    return specs

def getButtons(obj, chunkDims):
    table = obj[c4d.ID_USERDATA, 2]
    buttons = []
    
    
    
    for i in range(table.GetObjectCount()):
        button = table.ObjectFromIndex(doc, i)
        
        if button:
            chunk, index = getPosition(table.ObjectFromIndex(doc, i)[c4d.ID_BASEOBJECT_REL_POSITION], chunkDims)
            buttons.append(','.join(map(str, chunk)) + '_'+str(index))
        
    
    return buttons

def getPosition(pos, chunkDims):
    x = trueInt(pos.x)
    y = trueInt(pos.y)
    z = trueInt(pos.z)

    chunkX = trueInt(math.floor(x/chunkDims["chkX"]))
    chunkY = trueInt(math.floor(y/chunkDims["chkY"]))
    chunkZ = trueInt(math.floor(z/chunkDims["chkZ"]))
    
    return [
        (chunkX, chunkY, chunkZ),
        (x%chunkDims["chkX"]) + ((z%chunkDims["chkZ"]) * chunkDims["chkX"]) + ((y%chunkDims["chkY"]) * chunkDims["chkX"] * chunkDims["chkZ"])  #changed chkY to chkZ 
    ]
    
def renderFrame():
    c4d.DrawViews(c4d.DRAWFLAGS_ONLY_ACTIVE_VIEW|c4d.DRAWFLAGS_NO_THREAD|c4d.DRAWFLAGS_NO_REDUCTION|c4d.DRAWFLAGS_STATICBREAK)
    
def calcWorldBounds(bounds, chunk):
    boundDim(bounds, chunk[0], "X")
    boundDim(bounds, chunk[1], "Y")
    boundDim(bounds, chunk[2], "Z")
    
def boundDim(bounds, coord, letter):
    if not bounds["min"+letter]:
        bounds["min"+letter] = coord
        bounds["max"+letter] = coord
    elif coord < bounds["min"+letter]:
        bounds["min"+letter] = coord
    elif coord > bounds["max"+letter]:
        bounds["max"+letter] = coord
        
    return bounds

def getData():
    
    obj = op.GetObject()
    cdn = []
    clonedList = []
    levels = {}
    boxes = []
    getAllChildren(obj.GetDown(), cdn, clonedList)
    
    chunkDims = getChunksize()
    
    #set to frame 0
    doc.SetTime(c4d.BaseTime(0, doc.GetFps()))
    renderFrame()
    
    Chunks = OrderedDict({})
    
    bounds = {"minX": None, "maxX": None, "minY": None, "maxY": None, "minZ": None, "maxZ": None}
    
    for el in cdn:
        
        specs = getBlockType(el, chunkDims, boxes, levels)
        
        chunk_id = getPosition(el[c4d.ID_BASEOBJECT_REL_POSITION], chunkDims)    
    
        calcWorldBounds(bounds, chunk_id[0])
        
        currChunk = str(chunk_id[0][0])+","+str(chunk_id[0][1])+","+str(chunk_id[0][2])
        
        if currChunk not in Chunks:
            
            Chunks[currChunk] = []

        Chunks[currChunk].append([chunk_id[1], specs])
    
    #set char position of chunks in file
    strChunks = stringify(Chunks)
    worldDims = getChunksize()
    chunkSizes = worldDims["chunks"] = {}
    
    for level in levels:
        l = levels[level]
        
        l['w'] = l.pop('X', None)-l['x']+1
        l['l'] = l.pop('Z', None)-l['z']+1
        l['h'] = l.pop('Y', None)-l['y']+1
        
        
    levels[0] = {'s': 0}
    worldDims['levels'] = levels
    
    
        
    
    for chk in Chunks:
        strChunk = stringify(Chunks[chk])
        start = strChunks.find(strChunk)
        chunkSizes[chk] = [start, len(strChunk)+start]
        
    worldDims.update(bounds)
    
    for box in boxes:
         pos = box[1][c4d.ID_BASEOBJECT_REL_POSITION]
         pos = c4d.Vector(pos)
         pos.y -=1
         res = getPosition(pos, chunkDims)
         chkName = ','.join(map(str, res[0]))
         
         if chkName in Chunks:
             for block in Chunks[chkName]:
                if res[1] == block[0] and len(block[1]) > 1:
                    if block[1][1] in [3, 4, 5]:
                        box[0][2] = block[1][1]
                    break
                
         #print getPosition(x, y, z, chunkDims)
    
    #removed clones that got made to object 
    for o in clonedList:
        o.Remove()
    
    return {"worldInfo": worldDims, "chunks": Chunks}

def parentToOrigin(parent):
    pos = parent[c4d.ID_BASEOBJECT_REL_POSITION]
    if pos.GetLength() != 0:
        for c in parent.GetChildren():
            c[c4d.ID_BASEOBJECT_REL_POSITION]+=pos
            moveFrames(c, pos)
    
    parent[c4d.ID_BASEOBJECT_REL_POSITION] = c4d.Vector()
    

def getAllChildren(obj, resultList, deleteList):
    while obj:
        objType=obj.GetType()
        if objType == c4d.Onull:
            
            parentToOrigin(obj)
            
            getAllChildren(obj.GetDown(), resultList, deleteList)
        elif objType == c4d._Ocloner:
            
            decompose(obj, deleteList)
            
        else:
            resultList.append(obj)
        
        obj = obj.GetNext()
        
def decompose(cloner, clonedList):
    
    copied = cloner.GetClone()
    copied.InsertUnderLast(op.GetObject())
    #eventAdd?
    
    return_value = c4d.utils.SendModelingCommand(
         command = c4d.MCOMMAND_MAKEEDITABLE,
         list = [copied],
         mode = c4d.MODELINGCOMMANDMODE_ALL,
         bc = c4d.BaseContainer(),
         doc = doc)
    
    if return_value:
        parent = return_value[0]
        parent.InsertUnderLast(op.GetObject()) #!! op.GetObject()
        parentToOrigin(parent)
        
        clonedList.append(parent)
        c4d.EventAdd()
       
def trueInt(n):
    return int(round(n))

def stringify(obj):
    return json.dumps(obj, separators=(',', ':'))