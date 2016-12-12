/**
 * GEF(graphic editor framework)相关类，参考Eclipse GEF编写，完全应用MVC模式。
 * @type {Object}
 */
anra.gef = {};

/**
 * 视图
 * @type {*}
 */
anra.gef.Figure = anra.svg.Composite.extend({
    class:'Figure',
    isSelected:SELECTED_NONE,
    repaintListeners:null,
    init:function () {
    },
    propertyChanged:function (key, ov, nv) {
    },
    selectionChanged:function (value) {
        switch (value) {
            case SELECTED_NONE:
                this.owner.style.cursor = 'default';
                break;
            case SELECTED_PRIMARY:
            case SELECTED:
                this.owner.style.cursor = 'move';
        }

    },
    setModel:function (m) {
        this.unlisten();
        this.model = m;
        this.listen();
    },
    listen:function () {
        if (this.model instanceof anra.gef.BaseModel) {
            this.model.addPropertyListener(this);
        }
    },
    unlisten:function () {
        if (this.model instanceof anra.gef.BaseModel) {
            this.model.removePropertyListener(this);
        }
    },
    paint:function () {
        this.applyBounds();
        if (this.layoutManager != null)
            this.layout();
        this.fireRepaintListener();
        if (this.children)
            for (var i = 0; i < this.children.length; i++) {
                this.children[i].paint();
            }
    },
    fireRepaintListener:function () {
        if (this.repaintListeners != null)
            this.repaintListeners.forEach(function (_f, _k) {
                _k(this);
            }, this);
    },
    addRepaintListener:function (listener) {
        if (this.repaintListeners == null)
            this.repaintListeners = new Map();
        this.repaintListeners.put(listener, null);
    },
    removeRepaintListener:function (listener) {
        if (this.repaintListeners != null)
            this.repaintListeners.remove(listener);
    },
    dispose:function () {
        anra.svg.Composite.prototype.dispose.call(this);
        this.unlisten();
        if (this.repaintListeners != null) {
            this.repaintListeners.clear();
            this.repaintListeners = null;
        }
    }
})
;

var FLAG_ACTIVE = 1;
var FLAG_FOCUS = 2;
var MAX_FLAG = FLAG_FOCUS;

/**
 * 控制器
 * @type {*}
 */
anra.gef.EditPart = Base.extend({
    class:'EditPart',
    selectable:true,
    model:null,
    parent:null,
    selected:SELECTED_NONE,
    figure:null,
    policies:null,
    children:null,
    flags:0,
    editor:null,
    eventTable:null,
    constructor:function () {
        this.sConns = [];
        this.tConns = [];
        this.children = [];
        this.policies = new Map();
        this.eventTable = new anra.event.EventTable();
    },
    setLayout:function (layout) {
        this.getLayer(anra.gef.RootEditPart.PrimaryLayer).layoutManager = layout;
        this.getLayer(anra.gef.RootEditPart.PrimaryLayer).paint();
    },
    getRoot:function () {
        return this;
    },
    refreshChildren:function () {
        var i;
        if (this.children != null) {
            var map = new Map();
            //增量修改当前children

            for (i = 0; i < this.children.length; i++)
                map.set(this.children[i].model, this.children[i]);
            var model, editPart;
            var modelChildren = this.getModelChildren();
            for (i = 0; i < modelChildren.length; i++) {
                model = modelChildren[i];
                if (i < this.children.length
                    && this.children[i].model.equals(model)) {
//                    this.children[i].refresh();
                    continue;
                }
                editPart = map.get(model);
                if (editPart != null)
                    this.reorderChild(editPart, i);
                else {
                    editPart = this.createChild(model);
                    this.addChild(editPart, i);
                }
            }

            var size = this.children.length;
            if (i < size) {
                var trash = [];
                for (; i < size; i++)
                    trash.push(this.children[i]);
                for (i = 0; i < trash.length; i++) {
                    var ep = trash[i];
                    this.removeChild(ep);
                }
            }
        }
    },
    removeChild:function (child) {
        if (child == null)
            throw 'child can not be null';
        var index = this.children.indexOf(child);
        if (index < 0)
            return;
        this.fireRemovingChild(child, index);
        if (this.isActive())
            child.deactivate();
        child.removeNotify();
        this.removeChildVisual(child);
        child.setParent(null);
        this.children.remove(child);
    },
    fireRemovingChild:function (child, index) {
        var listeners = this.eventTable.getListeners(anra.gef.EditPartListener.prototype.class);
        for (var i = 0, len = listeners.length; i < len; i++) {
            listeners[i].removingChild(child, index);
        }
    },
    createChild:function (model) {
        if (this.editor == null) {
            anra.Platform.error("EditPart的editor不能为空");
            return null;
        }
        var part = this.editor.createEditPart != null ? this.editor.createEditPart(this, model) : model.editPartClass != null ? new model.editPartClass : null;
        if (part == null)
            return null;
        part.model = model;
        part.editor = this.editor;
        return part;
    },
    addChild:function (child, index) {
        if (this.children == null)
            this.children = [];
        if (index == null)
            index = this.children.length;

        this.children.insert(child, index);
        child.setParent(this);
        this.addChildVisual(child, index);
        child.addNotify();
        child.activate();
        this.fireChildAdded(child, index);
    },
    fireChildAdded:function (child, index) {
        var listeners = this.eventTable.getListeners(anra.gef.EditPartListener.prototype.class);
        for (var i = 0, len = listeners.length; i < len; i++)
            listeners[i].childAdded(child, index);
    },
    reorderChild:function (editpart, index) {
//        this.removeChildVisual(editpart);
        this.children.removeObject(editpart);
        this.children.insert(editpart, index);
//        this.addChildVisual(editpart, index);
    },
    removeChildVisual:function (child) {
        this.getFigure().removeChild(child.getFigure());
    },
    addChildVisual:function (child, index) {
        this.getFigure().addChild(child.getFigure());
    },
    deactivate:function () {
        var i;
        for (i = 0; i < this.children.length; i++) {
            this.children[i].deactivate();
        }
        this.deactivePolicies();
        for (i = 0; i < this.sConns.length; i++) {
            this.sConns[i].deactivate();
        }
        this.deactivePolicies();
    },
    activate:function () {
        this.setFlag(FLAG_ACTIVE, true);
        this.doActive();

        this.activePolicies();
        var i;
        for (i = 0; i < this.children.length; i++)
            this.children[i].activate();

        this.fireActivated();

        for (i = 0; i < this.sConns.length; i++) {
            this.sConns[i].activate();
        }
    },
    doActive:function () {
    },
    fireActivated:function () {
        var listeners = this.eventTable.getListeners(anra.gef.EditPartListener.prototype.class);
        for (var i = 0, len = listeners.length; i < len; i++)
            listeners[i].partActivated(this);
    },
    getFigure:function () {
        if (this.figure == null) {
            this.figure = this.createFigure(this.model);
            this.figure.setModel(this.model);
            this._initFigureListeners();
        }
        return this.figure;
    },
    _initFigureListeners:function () {
        if (this.figure != null) {
            var _dt = this.getRoot().editor.getTopDragTracker();
            var _ep = this;
            this.figure.addListener(anra.EVENT.MouseDown, function (e) {
                _dt.mouseDown(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseIn, function (e) {
                _dt.mouseIn(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseOut, function (e) {
                _dt.mouseOut(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseClick, function (e) {
                _dt.mouseClick(e, _ep);
            });
            this.figure.addListener(anra.EVENT.DragStart, function (e) {
                _dt.dragStart(e, _ep);
            });
            this.figure.addListener(anra.EVENT.DragEnd, function (e) {
                _dt.dragEnd(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseDrag, function (e) {
                _dt.mouseDrag(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseMove, function (e) {
                _dt.mouseMove(e, _ep);
            });
            this.figure.addListener(anra.EVENT.MouseUp, function (e) {
                _dt.mouseUp(e, _ep);
            });
        }
    },
    createFigure:function (model) {
        return new anra.gef.Figure();
    },
    isActive:function () {
        return this.getFlag(FLAG_ACTIVE);
    },
    getFlag:function (flag) {
        return (this.flags & flag) != 0;
    },
    setFlag:function (f, v) {
        if (v)
            this.flags |= f;
        else
            this.flags &= ~f;
    },
    addEditPartListener:function (listener) {
        this.eventTable.hook(listener.class, listener);
    },
    addNotify:function () {
        this.register();
        this.createEditPolicies();
        for (var i = 0; i < this.children.length; i++)
            this.children[i].addNotify();
        this.refresh();
    },
    createEditPolicies:function () {
    },
    installPolicies:function (policies) {
        for (var k in policies) {
            this.installEditPolicy(k, new policies[k]);
        }
    },
    installEditPolicy:function (key, editPolicy) {
        if (key == null) {
            throw 'installEditPolicy:Edit Policies must be installed with key';
        }
        if (editPolicy == null || !(editPolicy instanceof anra.gef.Policy)) {
            throw 'installEditPolicy:Edit Policies must be instanceof of anra.gef.Policy';
        }
        if (this.policies == null) {
            this.policies = new Map();
            this.policies.set(key, editPolicy);
        }
        else {
            var oldEditPolicy = this.policies.get(key);
            if (oldEditPolicy != null && oldEditPolicy.isActive()) {
                oldEditPolicy.deactivate();
            }
            this.policies.set(key, editPolicy);
        }
        editPolicy.setHost(this);
        if (this.isActive()) {
            editPolicy.activate();
        }
    },
    activePolicies:function () {
        this.policies.forEach(function (editPolicy) {
            editPolicy.activate();
        });
    },
    deactivePolicies:function () {
        this.policies.forEach(function (editPolicy) {
            editPolicy.deactivate();
        });
    },
    validatePolicies:function () {
        this.policies.forEach(function (editPolicy) {
            editPolicy.validatePolicy();
        });
    },
    getEditPolicy:function (key) {
        var policy = this.policies.get(key);
        return policy;
    },
    getLayoutPolicy:function () {
        return this.policies.get(anra.gef.LAYOUT_POLICY);
    },
    getConnectionPolicy:function () {
        return this.policies.get(anra.gef.CONNECTION_POLICY);
    },
    installLayoutPolicy:function (p) {
        this.installEditPolicy(anra.gef.LAYOUT_POLICY, p);
    },
    removeEditPolicy:function (key) {
        this.policies.remove(key);
    },
    unregister:function () {
        this.unregisterAccessable();
        this.unregisterVisuals();
        this.deactivate();
    },
    register:function () {
        this.registerAccessable();
        this.registerVisuals();
    },
    registerAccessable:function () {
        this.getRoot().regist(this);
    },
    unregisterAccessable:function () {
        this.getRoot().unregist(this);
    },
    registerVisuals:function () {
    },
    unregisterVisuals:function () {
    },
    eraseSourceFeedback:function (request) {
        if (!this.isActive())
            return;
        if (this.policies != null) {
            this.policies.forEach(function (v, k) {
                v.eraseSourceFeedback(request);
            });
        }
    },
    eraseTargetFeedback:function (request) {
        if (!this.isActive())
            return;
        if (this.policies != null) {
            this.policies.forEach(function (v, k) {
                v.eraseTargetFeedback(request);
            });
        }
    },
    showSourceFeedback:function (request) {
        if (!this.isActive())
            return;
        if (this.policies != null) {
            this.policies.forEach(function (v, k) {
                v.showSourceFeedback(request);
            });
        }
    },
    showTargetFeedback:function (request) {
        if (!this.isActive())
            return;
        if (this.policies != null) {
            this.policies.forEach(function (v, k) {
                v.showTargetFeedback(request);
            });
        }
    },
    getCommand:function (request) {
        var command = null;
        if (this.policies != null) {
            var plist = this.policies.values();
            for (var i = 0, len = plist.length; i < len; i++) {
                if (command != null)
                    command = command.chain(plist[i].getCommand(request));
                else
                    command = plist[i].getCommand(request);
            }
        }
        return command;
    },
    getDragTracker:function (request) {
        if (this.dragTracker == null && this.createDragTracker != null) {
            this.dragTracker = this.createDragTracker(request);
        }
        return this.dragTracker;
    },
    getSelected:function () {
        return this.selected;
    },
    getTargetEditPart:function (request) {
        var editPart;
        var plist = this.policies.values();
        for (var i = 0, len = plist.length; i < len; i++) {
            if (plist[i].getTargetEditPart != null)
                editPart = plist[i].getTargetEditPart(request);
            if (editPart != null)
                return editPart;
        }
        if (REQ_SELECTION == request.type) {
            if (this.isSelectable())
                return this;
        }
        return null;
    },
    isSelectable:function () {
        return false;
    },
    getScene:function () {
    },
    hasFocus:function () {
        return this.getFlag(FLAG_FOCUS);
    },
    performRequest:function (request) {
    },
    refresh:function () {
        this.refreshVisual();
        this.refreshChildren();
        this.validatePolicies();
    },
    /**
     * 调用之后必须应用this.figure.paint();
     */
    refreshVisual:function () {
        if (this.figure != null) {
            this.figure.paint();
        }

    },
    removeEditPartListener:function (listener) {
        this.eventTable.unhook(listener.class, listener);
    },
    removeNotify:function () {
        this.unregisterAccessable();
        this.unregisterVisuals();
        this.unregister();
    },
    setFocus:function (f) {
        if (this.hasFocus() == f)
            return;
        this.setFlag(FLAG_FOCUS, f);
        this.fireSelectionChanged();
    },
    fireSelectionChanged:function () {
        var listeners = this.eventTable.getListeners(anra.gef.EditPartListener.prototype.class);
        for (var i = 0, len = listeners.length; i < len; i++) {
            listeners[i].selectedStateChanged(this);
        }
    },
    setModel:function (model) {
        this.model = model;
    },
    getModelChildren:function () {
        if (this.model instanceof anra.gef.NodeModel) {
            return this.model.getAllChildren();
        }
        return [];
    },
    setParent:function (parent) {
        this.parent = parent;
    },
    setSelected:function (value) {
        this.selected = value;
        if (this.figure != null && this.figure.selectionChanged != null)
            this.figure.selectionChanged(value);
        this.fireSelectionChanged();
    },
    understandsRequest:function (req) {
        if (this.policies != null) {
            var list = this.policies.values();
            for (var i = 0; i < list.length; i++) {
                if (list[i].understandsRequest != null && list[i].understandsRequest(req))return true;
            }
        }
        return false;
    }
});

anra.gef.NodeEditPart = anra.gef.EditPart.extend({
    sConns:null,
    tConns:null,
    lineCache:null,
    getSourceAnchor:function (req) {
        return this.figure.getSourceAnchor(req);
    },
    getAllSourceAnchors:function () {

    },
    createDragTracker:function () {
        return null;
    },
    getTargetAnchor:function (req) {
        return this.figure.getTargetAnchor(req);
    },
    constructor:function () {
        anra.gef.EditPart.prototype.constructor.call(this);
        this.sConns = [];
        this.tConns = [];
    },
    refresh:function () {
        this.base();
        this.refreshSourceConnections();
        this.refreshTargetConnections();
    },
    getModelSourceLines:function () {
        return this.model.sourceLines == null ? [] : this.model.sourceLines.values();
    },
    getModelTargetLines:function () {
        return this.model.targetLines == null ? [] : this.model.targetLines.values();
    },
    getRoot:function () {
        return this.parent.getRoot();
    },
    refreshSourceConnections:function () {
        var i;
        var editPart;
        var model;
        var map = new Map();
        if (this.sConns.length > 0) {
            for (i = 0; i < this.sConns.length; i++) {
                editPart = this.sConns[i];
                map.set(editPart.model, editPart);
            }
        }
        var modelObjects = this.getModelSourceLines();
        if (modelObjects != null)
            for (i = 0; i < modelObjects.length; i++) {
                model = modelObjects[i];
                if (i < this.sConns.length && this.sConns[i].model == model) {
                    this.sConns[i].refresh();
                    continue;
                }
                editPart = map.get(model);
                if (editPart != null)
                    this.reorderSourceConnection(editPart, i);
                else {
                    editPart = this.createOrFindConnection(model);
                    this.addSourceConnection(editPart, i);
                }
            }

        // Remove the remaining EditParts
        size = this.sConns.length;
        if (i < size) {
            var trash = [];
            for (; i < size; i++)
                trash.push(this.sConns[i]);
            for (i = 0; i < trash.length; i++)
                this.removeSourceConnection(trash[i]);
        }
    },
    reorderSourceConnection:function (line, index) {
        this.sConns.remove(index);
        this.sConns.insert(line, index);
        line.refresh();
    },
    removeSourceConnection:function (line) {
        this.fireRemovingSourceConnection(line, this.sConns
            .indexOf(line));
        if (line.source == this) {
            line.deactivate();
            line.source = null;
        }
        this.sConns.removeObject(line);
    },
    addSourceConnection:function (line, index) {
        this.sConns.insert(line, index);
        var source = line.source;
        if (source != null)
            source.sConns.removeObject(line);
        line.setSource(this);
        if (this.isActive())
            line.activate();
        this.fireSourceConnectionAdded(line, index);
    },

    refreshTargetConnections:function () {
        var i;
        var editPart;
        var model;
        var map = new Map();
        if (this.tConns.length > 0) {
            for (i = 0; i < this.tConns.length; i++) {
                editPart = this.tConns[i];
                map.set(editPart.model, editPart);
            }
        }
        var modelObjects = this.getModelTargetLines();
        if (modelObjects != null)
            for (i = 0; i < modelObjects.length; i++) {
                model = modelObjects[i];
                if (i < this.tConns.length && this.tConns[i].model == model) {
                    this.tConns[i].refresh();
                    continue;
                }
                editPart = map.get(model);
                if (editPart != null)
                    this.reorderTargetConnection(editPart, i);
                else {
                    editPart = this.createOrFindConnection(model);
                    this.addTargetConnection(editPart, i);
                }
            }
        // Remove the remaining EditParts
        size = this.tConns.length;
        if (i < size) {
            var trash = [];
            for (; i < size; i++)
                trash.push(this.tConns[i]);
            for (i = 0; i < trash.length; i++)
                this.removeTargetConnection(trash[i]);
        }
    },
    addTargetConnection:function (line, index) {
        this.tConns.insert(line, index);
        var target = line.source;
        if (target != null)
            target.tConns.removeObject(line);
        line.setTarget(this);
        this.fireTargetConnectionAdded(line, index);
        line.refresh();
    },
    reorderTargetConnection:function (line, index) {
        this.tConns.remove(index);
        this.tConns.insert(line, index);
        line.refresh();
    },
    removeTargetConnection:function (line, index) {
        this.fireRemovingTargetConnection(line, this.tConns.indexOf(line));
        if (line.target == this)
            line.target = null;
        this.tConns.removeObject(line);
    },
    createLineEditPart:function (model) {
        return new anra.gef.LineEditPart(model);
    },
    findLineEditPart:function (model) {
        return this.getRoot().getEditPart(model);
    },
    createOrFindConnection:function (model) {
        var linepart = this.findLineEditPart(model);
        if (linepart == null) {
            linepart = this.createLineEditPart(model);
            linepart.setModel(model);
        }
        return linepart;
    },
    unregisterVisuals:function () {
        this.figure.dispose();
    },
    fireSourceConnectionAdded:function (line, i) {
        //TODO 增加连线事件类型
    },
    fireRemovingSourceConnection:function (line, i) {
        //TODO
    },
    fireTargetConnectionAdded:function (line, i) {
    },
    fireRemovingTargetConnection:function (line, i) {

    }
});
anra.gef.RootEditPart = anra.gef.EditPart.extend({
    layers:null,
    class:'RootEditPart',
    constructor:function () {
        anra.gef.EditPart.prototype.constructor.call(this);
        this.editPartMap = new Map();
        this.layers = new Map();
    },
    createDragTracker:function () {
        return new anra.gef.RootDragTracker();
    },
    setSelection:function (o) {
        if (this.selection == o || (this.selection != null && this.selection instanceof Array && this.selection.contains(o)))return;
        this.clearSelection();
        this.selection = o;
        if (o instanceof Array) {
            for (var i = 0; i < o.length; i++)
                o[i].setSelected(SELECTED_PRIMARY);
        } else if (o instanceof anra.gef.EditPart) {
            o.setSelected(SELECTED_PRIMARY);
        }
    },
    clearSelection:function () {
        if (this.selection != null) {
            var o = this.selection;
            if (o instanceof Array) {
                for (var i = 0; i < o.length; i++)
                    o[i].setSelected(SELECTED_NONE);
            } else if (o instanceof anra.gef.EditPart) {
                o.setSelected(SELECTED_NONE);
            }
        }
    },
    getRoot:function () {
        return this;
    },
    createLayer:function () {
        if (this.figure != null) {
            var painterLayer = new anra.svg.Group();
            var primaryLayer = new anra.svg.Group();
            var lineLayer = new anra.svg.Group();
            var handleLayer = new anra.svg.Group();
            var feedbackLayer = new anra.svg.Group();
            this.figure.addChild(painterLayer);
            this.figure.addChild(primaryLayer);
            this.figure.addChild(lineLayer);
            this.figure.addChild(handleLayer);
            this.figure.addChild(feedbackLayer);
            this.layers.set(anra.gef.RootEditPart.PainterLayer, painterLayer);
            this.layers.set(anra.gef.RootEditPart.PrimaryLayer, primaryLayer);
            this.layers.set(anra.gef.RootEditPart.LineLayer, lineLayer);
            this.layers.set(anra.gef.RootEditPart.HandleLayer, handleLayer);
            this.layers.set(anra.gef.RootEditPart.FeedbackLayer, feedbackLayer);
        }
    },
    getLineLayer:function () {
        return this.getLayer(anra.gef.RootEditPart.LineLayer);
    },
    getPainterLayer:function () {
        return this.getLayer(anra.gef.RootEditPart.PainterLayer);
    },
    getHandleLayer:function () {
        return  this.getLayer(anra.gef.RootEditPart.HandleLayer);
    },
    getPrimaryLayer:function () {
        return  this.getLayer(anra.gef.RootEditPart.PrimaryLayer);
    },
    getFeedbackLayer:function () {
        return  this.getLayer(anra.gef.RootEditPart.FeedbackLayer);
    },
    getLayer:function (key) {
        return this.layers.get(key);
    },
    addChildVisual:function (child, index) {
        this.getPrimaryLayer().addChild(child.getFigure());
    },
    removeChildVisual:function (child) {
        this.getPrimaryLayer().removeChild(child.getFigure());
    },
    regist:function (editPart) {
        this.editPartMap.put(editPart.model, editPart);
    },
    unregist:function (editPart) {
        this.editPartMap.remove(editPart.model);
    },
    getEditPart:function (model) {
        return this.editPartMap.get(model);
    }
});
anra.gef.RootEditPart.PrimaryLayer = "Primary_Layer";
anra.gef.RootEditPart.HandleLayer = "Handle_Layer";
anra.gef.RootEditPart.FeedbackLayer = "Feedback_Layer";
anra.gef.RootEditPart.DefineLayer = "defineLayer";
anra.gef.RootEditPart.PainterLayer = "painterLayer";
anra.gef.RootEditPart.LineLayer = "lineLayer";

anra.gef.LineEditPart = anra.gef.EditPart.extend({
    target:null,
    source:null,
    doActive:function () {
    },
    setTarget:function (t) {
        if (this.target == t)
            return;
        this.target = t;
        if (t != null)
            this.setParent(t.getRoot());
        else if (this.source == null)
            this.setParent(null);
        if (this.source != null && this.target != null)
            this.refresh();
    },
    deactivate:function () {
        var i;
        for (i = 0; i < this.children.length; i++) {
            this.children[i].deactivate();
        }
        this.deactivePolicies();

        if (this.model.targetNode != null) {
            this.model.targetNode.removeTargetLine(this.model);
            this.model.targetNode = null;
        }
        if (this.model.sourceNode != null) {
            this.model.sourceNode.removeSourceLine(this.model);
            this.model.sourceNode = null;
        }
    },
    setSource:function (t) {
        if (this.source == t)
            return;
        this.source = t;
        if (t != null)
            this.setParent(t.getRoot());
        else if (this.target == null)
            this.setParent(null);
        if (this.source != null && this.target != null)
            this.refresh();
    },
    setParent:function (parent) {
        var wasNull = this.parent == null;
        var becomingNull = parent == null;
        if (becomingNull && !wasNull)
            this.removeNotify();
        this.parent = parent;
        if (wasNull && !becomingNull)
            this.addNotify();
    },
    unregisterVisuals:function () {
        this.deactivateFigure();
    },
    deactivateFigure:function () {
        this.getRoot().getLineLayer().removeChild(this.figure);
        this.figure.setSourceAnchor(null);
        this.figure.setTargetAnchor(null);
    },
    registerAccessable:function () {
        this.getRoot().regist(this);
    },
    unregisterAccessable:function () {
        this.getRoot().unregist(this);
    },
    registerVisuals:function () {
        this.activateFigure();
    },
    activateFigure:function () {
        this.getRoot().getLineLayer().addChild(this.getFigure());
    },
    getRoot:function () {
        return this.parent.getRoot();
    },
    createFigure:function () {
        return new anra.gef.Line();
    },
    refresh:function () {
        if (this.figure == null) {
            this.getRoot().getLineLayer().addChild(this.getFigure());
        }
        this.refreshSourceAnchor();
        this.refreshTargetAnchor();
        this.refreshVisual();
        this.refreshChildren();
    },
    refreshSourceAnchor:function () {
        this.figure.setSourceAnchor(this.getSourceAnchor());
    },
    refreshTargetAnchor:function () {
        this.figure.setTargetAnchor(this.getTargetAnchor());
    },
    getSourceAnchor:function () {
        if (this.source != null)
            return this.source.getSourceAnchor(this);
        return {x:0, y:0};
    },
    getTargetAnchor:function () {
        if (this.target != null)
            return this.target.getTargetAnchor(this);
        return {x:100, y:100};
    }
});


anra.gef.Tool = Base.extend({
    activate:function () {
    },
    deactivate:function () {
    },
    getEventDispatcher:function () {
        return this.editor.rootEditPart.getFigure().svg.dispatcher;
    },
    notifyListeners:function (eventType, func) {
        //TODO
    },
    disableEvent:function () {
    },
    enableEvent:function () {
    },
    mouseUp:function (e, p) {
//        if (this.dragEnd != null)
//            this.dragEnd(e, p);
        this.editor.setActiveTool(this.editor.getDefaultTool());
    }
});

anra.gef.SelectionTool = anra.gef.Tool.extend({
    id:'selection tool',
    mouseDown:function (e, p) {
        p.getRoot().setSelection(p);
    },
    dragStart:function (e, p) {
        if (p instanceof anra.gef.RootEditPart) {
            if (this.marqueeTool == null)
                this.marqueeTool = new anra.gef.MultiSelectionTool();
            this.editor.setActiveTool(this.marqueeTool);
        }
    }
});
anra.gef.MultiSelectionTool = anra.gef.Tool.extend({
    id:'multi selection tool',
    dragEnd:function (e, p) {
        if (this.marquee != null)
            this.editor.rootEditPart.getFeedbackLayer().removeChild(this.marquee);
        this.marquee = null;
        this.editor.setActiveTool(this.editor.getDefaultTool());
    },
    mouseUp:function (e, p) {
        this.dragEnd(e, p);
    },
    mouseDrag:function (e, p) {
        var marquee = this.getMarqueeVisual(e);
        this.refreshMarquee(marquee, e);
        this.calculateSelection(marquee);
    },
    getMarqueeVisual:function (e) {
        if (this.marquee == null) {
            this.marquee = new anra.svg.Control();
            this.marquee.setOpacity(0.3);
            this.marquee.disableEvent();
            this.marquee.setAttribute({
                stroke:'black',
                fill:'grey'
            });
            this.marquee.x = e.x;
            this.marquee.y = e.y;
            this.editor.rootEditPart.getFeedbackLayer().addChild(this.marquee);
        }
        return this.marquee;
    },
    calculateSelection:function (marquee) {
        var b = marquee.bounds;
        var children = this.editor.rootEditPart.children;
        var selection = [];
        for (var i = 0; i < children.length; i++) {
            if (anra.Rectangle.observe(b, children[i].figure.bounds))
                selection.push(children[i]);
        }
        this.editor.rootEditPart.setSelection(selection);
    },
    refreshMarquee:function (f, e) {
        var nx = e.x;
        var ny = e.y;
        var mX = f.x < nx ? f.x : nx;
        var mY = f.y < ny ? f.y : ny;
        f.setBounds({
            x:mX,
            y:mY,
            width:Math.abs(f.x - nx),
            height:Math.abs(f.y - ny)
        });
    }
});

anra.gef.CreationTool = anra.gef.Tool.extend({
    constructor:function (model) {
        this.model = model;
    },
    activate:function () {
        this.getEventDispatcher().mouseState = anra.EVENT.MouseDrag;
        this.getEventDispatcher().dragTarget = {model:this.model};
    },
    mouseDown:function () {
        this.getEventDispatcher().mouseState = anra.EVENT.MouseDrag;
        return true;
    },
    getEditPart:function (parentEditPart) {
        if (this.virtualEP == null) this.virtualEP = parentEditPart.createChild(this.model);
        return this.virtualEP;
    },
    mouseDrag:function (e, p) {
        var policy = this.getLayoutPolicy(e, p);
        if (policy == null)return false;
        var v = this;
        var req = {
            editPart:p,
            target:v,
            event:e,
            type:REQ_CREATE
        };
        policy.showTargetFeedback(req);
        return true;
    },
    getLayoutPolicy:function (e, p) {
        var policy = p.getLayoutPolicy();
        var parent = p;
        while (policy == null && parent != null) {
            policy = parent.getLayoutPolicy();
            parent = p.parent;
        }
        return policy;
    },
    dragEnd:function (me, editPart) {
        if (editPart == null)return false;
        var policy = this.getLayoutPolicy(me, editPart);
        if (policy == null)return false;
        var v = this;
        var req = {
            editPart:editPart,
            target:v,
            event:me,
            type:REQ_CREATE
        };
        policy.eraseTargetFeedback(req);
        var cmd = policy.getCommand(req);
        if (cmd != null && cmd.canExecute()) {
            editPart.getRoot().editor.execute(cmd);
        } else {
            return this.dragEnd(me, editPart.parent)
        }
        return true;
    },
    getCommand:function (e, p) {
        return new anra.gef.CreateNodeCommand();
    }
});
/**
 * 连线工具
 * @type {*}
 */
anra.gef.LinkLineTool = anra.gef.Tool.extend({
    id:'link tool',
    type:null,
    constructor:function (m) {
        this.model = m;
        this.type = REQ_CONNECTION_START;
    },
    mouseOut:function (e, p) {
        if (p instanceof anra.gef.NodeEditPart) {
            var policy = p.getConnectionPolicy();
            var v = this;
            var req = {
                editPart:p,
                target:v,
                event:e,
                type:v.type
            };
            if (policy != null) {
                policy.eraseSourceFeedback(req);
                policy.eraseTargetFeedback(req);
            }
        }
    },
    mouseMove:function (e, p) {
        var v = this;
        var req = {
            editPart:p,
            target:v,
            event:e,
            type:v.type
        };
        if (this.type == REQ_CONNECTION_START && p instanceof anra.gef.NodeEditPart) {
            var policy = p.getConnectionPolicy();
            if (policy != null) {
                policy.showSourceFeedback(req);
            }
        } else if (this.type == REQ_RECONNECT_TARGET) {
            if (p instanceof anra.gef.NodeEditPart) {
                policy = p.getConnectionPolicy();
                if (policy != null) {
                    this.targetEditPart = p;
                    this.targetAnchor = p.getTargetAnchor(req);
                    policy.showTargetFeedback(req);
                }
                this.refreshGuideLine(req);
            } else if (p instanceof anra.gef.RootEditPart) {
                this.targetEditPart = null;
                this.targetAnchor = null;
                this.refreshGuideLine(req);
            }
        }
        return true;
    },
    createGuideLine:function (req) {
        return this.sourceEditPart.createLineEditPart().createFigure();
    },
    removeGuideLine:function () {
        if (this.sourceEditPart != null && this.guideLine != null)
            this.sourceEditPart.getConnectionPolicy().removeFeedback(this.guideLine);
    },
    refreshGuideLine:function (req) {
        if (this.guideLine == null) {
            this.guideLine = this.createGuideLine(req);
            this.sourceEditPart.getConnectionPolicy().addFeedback(this.guideLine);
            this.guideLine.setSourceAnchor(this.sourceAnchor);
            this.guideLine.disableEvent();
        }
        if (this.targetAnchor != null)
            this.guideLine.setTargetAnchor(this.targetAnchor);
        else
            this.guideLine.setTargetAnchor({x:req.event.x, y:req.event.y});
        this.guideLine.paint();
    },
    mouseDown:function (e, p) {
        if (p instanceof anra.gef.NodeEditPart) {
            if (this.type == REQ_CONNECTION_START) {
                this.type = REQ_RECONNECT_TARGET;
                this.sourceEditPart = p;
                this.sourceAnchor = p.getSourceAnchor({x:e.x, y:e.y, source:p});
            }
            var policy = p.getConnectionPolicy();
            var v = this;
            var req = {
                editPart:p,
                target:v,
                event:e,
                type:v.type
            };
            if (policy != null) {
                this.command = policy.getCreateConnectionCommand(req);
                policy.eraseSourceFeedback(req);
                policy.eraseTargetFeedback(req);
            }
        }
    },
    mouseDrag:function (e, p) {
        this.mouseMove(e, p);
        return true;
    },
    dragEnd:function (e, p) {
        this.mouseUp(e, p);
        return true;
    },
    mouseUp:function (e, p) {
        if (p instanceof anra.gef.NodeEditPart && this.type == REQ_RECONNECT_TARGET) {
            this.type = REQ_CONNECTION_END;
            this.targetEditPart = p;
            this.targetAnchor = p.getTargetAnchor({x:e.x, y:e.y, source:p});
            var policy = p.getConnectionPolicy();
            var v = this;
            var req = {
                editPart:p,
                target:v,
                event:e,
                type:v.type,
                command:v.command
            };
            if (policy != null) {
                this.command = policy.getConnectionCompleteCommand(req);
                policy.eraseSourceFeedback(req);
                policy.eraseTargetFeedback(req);
            }
            if (this.command != null)
                p.getRoot().editor.execute(this.command);
        }
        this.reset();
        return true;
    },
    reset:function () {
        this.removeGuideLine();
        this.type = REQ_CONNECTION_START;
        this.targetAnchor = null;
        this.targetEditPart = null;
        this.sourceAnchor = null;
        this.sourceEditPart = null;
        this.guideLine = null;
        this.command = null;
    },
    create:function (editPart) {
        if (editPart != null) {
            return editPart.createLineEditPart(this.model);
        }
    }
})
;

/**
 * DragTracker总控，如果子DragTracker对应方法不为true，则交由父级处理
 *
 * @type {*}
 */
anra.gef.TopDragTracker = Base.extend({
    constructor:function (editor) {
        this.editor = editor;
    },
    invoke:function (me, editPart, dragTracker, method) {
        return dragTracker && dragTracker[method] != null &&
            dragTracker[method](me, editPart);
    },
    invokeLoop:function (me, editPart, method) {
        var p = editPart;
        while (!this.invoke(me, p, p.getDragTracker(), method) && p.parent != null) {
            p = p.parent;
        }
    },
    getActiveTool:function () {
        return this.editor.getActiveTool();
    },
    mouseMove:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseMove'))
            this.invokeLoop(me, editPart, 'mouseMove');
    },
    mouseDown:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseDown'))
            this.invokeLoop(me, editPart, 'mouseDown');
    },
    mouseClick:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseClick'))
            this.invokeLoop(me, editPart, 'mouseClick');
    },
    dragStart:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'dragStart'))
            this.invokeLoop(me, editPart, 'dragStart');
    },
    mouseDrag:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseDrag'))
            this.invokeLoop(me, editPart, 'mouseDrag');
    },
    dragEnd:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'dragEnd'))
            this.invokeLoop(me, editPart, 'dragEnd');
    },
    mouseUp:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseUp'))
            this.invokeLoop(me, editPart, 'mouseUp');
    },
    mouseIn:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseIn'))
            this.invokeLoop(me, editPart, 'mouseIn');
    },
    mouseOut:function (me, editPart) {
        if (!this.invoke(me, editPart, this.getActiveTool(), 'mouseOut'))
            this.invokeLoop(me, editPart, 'mouseOut');
    }
});

/**
 * 处理EditPart级别的鼠标事件
 * @type {*}
 */
anra.gef.RootDragTracker = Base.extend({
    mouseDown:function (me, editPart) {
//        editPart.getRoot().setSelection(editPart);
    },
    mouseClick:function (me, editPart) {
    },
    dragStart:function (me, editPart) {
        var req = {
            editPart:editPart,
            target:me.prop.drag,
            event:me,
            type:REQ_DRAG_START
        };
        editPart.showSourceFeedback(req);
    },
    mouseDrag:function (me, editPart) {
        var v = this;
        var req = {
            editPart:editPart,
            target:me.prop.drag,
            event:me,
            type:REQ_MOVE
        };
        if (req.type == null)return false;
        editPart.showTargetFeedback(req);
    },
    dragEnd:function (me, editPart) {
        var v = this;
        var req = {
            editPart:editPart,
            target:me.prop.drag,
            event:me,
            type:REQ_MOVE
        };
        var cmd = editPart.getCommand(req);
        if (cmd != null) {
            editPart.getRoot().editor.execute(cmd);
        }
        editPart.eraseTargetFeedback(req);
    },
    mouseUp:function (me, editPart) {
        var req = {
            editPart:editPart,
            event:me,
            type:REQ_MOUSE_UP
        };
        editPart.eraseTargetFeedback(req);
    }
});


anra.gef.DragTracker = anra.gef.RootDragTracker.extend({

    mouseDrag:function (me, editPart) {
    },

    dragStart:function (me, editPart) {
        return true;
    },
    dragEnd:function (me, editPart) {
        var v = this;
        var req = {
            editPart:editPart,
            target:me.prop.drag,
            event:me,
            type:REQ_MOVE
        };
        if (req.type == null)return false;
        var cmd = editPart.getCommand(req);
        if (cmd != null) {
            editPart.getRoot().editor.execute(cmd);
        }
        editPart.eraseTargetFeedback(req);
        return cmd != null && cmd.canExecute();
    },
    mouseDown:function (me, editPart) {
//        editPart.getRoot().setSelection(editPart);
        return true;
    }
});


anra.gef.RelocalCommand = anra.Command.extend({
    constructor:function (editPart, sp, ep) {
        this.sp = sp;
        this.ep = ep;
        this.model = editPart.model;
        this.root = editPart.getRoot();
    },
    dispose:function () {
        this.editPart = null;
    },
    canExecute:function () {
        return this.model != null && this.sp != null && this.ep != null;
    },
    execute:function () {
        this.editPart = this.root.getEditPart(this.model);
        this.editPart.model.getBounds()[0] = this.ep.x;
        this.editPart.model.getBounds()[1] = this.ep.y;
        this.editPart.refresh();
    },
    undo:function () {
        this.editPart.model.getBounds()[0] = this.sp.x;
        this.editPart.model.getBounds()[1] = this.sp.y;
        this.editPart.refresh();
    }
});
/**
 * 创建节点Command
 * @param rootEditPart 根EditPart
 * @param node 节点模型
 */
anra.gef.CreateNodeCommand = anra.Command.extend({
    constructor:function (rootEditPart, node) {
        this.rootEditPart = rootEditPart;
        this.node = node;
    },
    canExecute:function () {
        return this.rootEditPart != null && this.node != null;
    },
    execute:function () {
        this.rootEditPart.model.addChild(this.node);
        this.rootEditPart.refresh();
    },
    undo:function () {
        this.rootEditPart.model.removeChild(this.node);
        this.rootEditPart.refresh();
    }
});
/**
 * 创建连线command
 *
 * @param rootEditPart 根EditPart
 * @param line 连线模型
 * @param sourceId 源节点ID
 * @param targetId 目标节点ID
 */
anra.gef.CreateLineCommand = anra.Command.extend({

    constructor:function (rootEditPart, line, sourceId, targetId) {
        this.rootEditPart = rootEditPart;
        this.line = line;
        this.targetId = targetId;
        this.sourceId = sourceId;

    },
    canExecute:function () {
        return this.rootEditPart != null && this.line != null && this.sourceId != null && this.targetId != null
    },
    execute:function () {
        this.target = this.rootEditPart.model.getChild(this.targetId);
        this.source = this.rootEditPart.model.getChild(this.sourceId);
        if (this.target == null)
            anra.Platform.error('can not found line target id: ' + this.targetId);
        if (this.source == null)
            anra.Platform.error('can not found line source id: ' + this.sourceId);
        var flag = this.source.addSourceLine(this.line);
        if (!flag)return;
        flag &= this.target.addTargetLine(this.line);
        if (!flag)return;
        var sourcePart = this.sourcePart = this.rootEditPart.getEditPart(this.source);
        if (sourcePart != null)
            sourcePart.refresh();

        var targetPart = this.targetPart = this.rootEditPart.getEditPart(this.target);
        if (targetPart != null)
            targetPart.refresh();
    },
    undo:function () {
        this.source.removeSourceLine(this.line);
        this.target.removeTargetLine(this.line);
        if (this.sourcePart != nul)
            this.sourcePart.refresh();
        if (this.targetPart != null)
            this.targetPart.refresh();

    }
});


anra.gef.ConstraintCommand = anra.Command.extend({
    constructor:function (editPart, sp, ep) {
        this.sp = sp;
        this.ep = ep;
        this.editPart = editPart;
    },
    canExecute:function () {
        return this.editPart != null && this.sp != null && this.ep != null;
    },
    execute:function () {
        this.editPart.model.getBounds()[0] = this.ep.x;
        this.editPart.model.getBounds()[1] = this.ep.y;
        this.editPart.model.getBounds()[2] = this.ep.width;
        this.editPart.model.getBounds()[3] = this.ep.height;
        this.editPart.refresh();
    },
    undo:function () {
        this.editPart.model.getBounds()[0] = this.sp.x;
        this.editPart.model.getBounds()[1] = this.sp.y;
        this.editPart.model.getBounds()[2] = this.sp.width;
        this.editPart.model.getBounds()[3] = this.sp.height;
        this.editPart.refresh();
    }
});

anra.gef.Policy = Base.extend({
    editPart:null,
    setHost:function (editPart) {
        this.editPart = editPart;
    },
    isActive:function () {
    },
    getHostFigure:function () {
        return this.editPart.getFigure();
    },
    getTargetEditPart:function (request) {
        return this.getHost();
    },
    getHost:function () {
        return this.editPart;
    },
    activate:function () {
    },
    deactivate:function () {
    },
    validatePolicy:function () {
    },
    getHandleLayer:function () {
        return  this.getHost().getRoot().getLayer(anra.gef.RootEditPart.HandleLayer);
    },
    getPrimaryLayer:function () {
        return  this.getHost().getRoot().getLayer(anra.gef.RootEditPart.PrimaryLayer);
    },
    getFeedbackLayer:function () {
        return  this.getHost().getRoot().getLayer(anra.gef.RootEditPart.FeedbackLayer);
    },
    eraseSourceFeedback:function (request) {
    },
    eraseTargetFeedback:function (request) {
    },
    showSourceFeedback:function (request) {
    },
    showTargetFeedback:function (request) {
    },
    getCommand:function (request) {
    },
    removeFeedback:function (figure) {
        this.getFeedbackLayer().removeChild(figure);
    },
    addFeedback:function (figure) {
        this.getFeedbackLayer().addChild(figure);
    }
});
anra.gef.LAYOUT_POLICY = 'layoutPolicy';
anra.gef.CONNECTION_POLICY = 'CONNECTION_POLICY';

anra.gef.Palette = anra.gef.Figure.extend({});

anra.gef.Request = Base.extend({});
anra.gef.Editor = Base.extend({
    canvas:null,
    input:null,
    palette:null,
    element:null,
    rootEditPart:null,
    cmdStack:null,
    background:'#EEFFEE',
    setInput:function (input) {
        this.input = input;
        this.rootModel = new anra.gef.ContentModel();
        this.input2model(this.input, this.rootModel);
    },
    input2model:function (input) {
        return input;
    },
    createContent:function (parentId) {

        this.setActiveTool(this.getDefaultTool());

        this.element = document.getElementById(parentId);
        this.actionRegistry = new anra.ActionRegistry();
        this.registActions();
        if (this.element == null) {
            anra.Platform.error('GEF的父级元素不能为空');
            return;
        }
//        this.palette = this.createPalette(parentId);
        this.canvas = this.createCanvas(parentId);

        this._initCanvasListeners(this.canvas);

        this.rootEditPart = this.createRootEditPart();
        this.rootEditPart.editor = this;
        this.initRootEditPart(this.rootEditPart);
        this.rootEditPart.setModel(this.rootModel);
        this.rootEditPart._initFigureListeners();
        this.rootEditPart.activate();
        this.cmdStack = new anra.CommandStack();
        this.rootEditPart.refresh();
    },
    _initCanvasListeners:function (cav) {
        var editor = this;
        this.canvas.addKeyListener(function (e) {
            editor.actionRegistry.keyHandle(e);
        });
    },
    registActions:function () {

    },
    execute:function (c) {
        if (this.cmdStack != null)
            this.cmdStack.execute(c);
    },
    createRootEditPart:function () {
        var root = new anra.gef.RootEditPart();
        root.figure = this.canvas;
        root.setModel(this.models);
        root.createLayer();
        var policies = new Map();
        this.getCustomPolicies.call(policies);
        policies.forEach(function (v, k) {
            root.installEditPolicy(k, v);
        });
        return root;
    },
    getCustomPolicies:function () {
        return null;
    },
    initRootEditPart:function (editPart) {
    },
    _save:function () {
        this.doSave();
        this.cmdStack.markSaveLocation();
    },
    doSave:function () {
        //执行保存
    },
    isDirty:function () {
        return this.cmdStack.isDirty();
    },
//    getDefaultTool:function () {
//        if (this.tool == null)
//            this.tool = new anra.gef.SelectionTool();
//        return this.tool;
//    },
    createPalette:function (id) {
        var i = id + 'Plt';
        var div = document.createElement('div');
        div.setAttribute('id', id + 'Plt');
        div.style.position = 'relative';
        div.style.width = '10%';
        div.style.height = '100%';
        div.style.float = 'left';
        div.style.backgroundColor = '#CCCCCC';
        this.element.appendChild(div);
        return new anra.gef.Palette(i);
    },
    createCanvas:function (id) {
        var i = id + 'Cav';
        var div = document.createElement('div');
        div.setAttribute('id', i);
        div.style.position = 'relative';
        div.style.width = '90%';
        div.style.height = '100%';
        div.style.float = 'right';
        div.style.overflow = 'auto';
        div.style.background = this.background;
        this.element.appendChild(div);
        return new anra.SVG(i);
    },
    setActiveTool:function (tool) {
        if (this.activeTool == tool)return;
        if (this.activeTool != null) {
            this.activeTool.deactivate();
            this.activeTool.editor = null;
        }
        this.activeTool = tool;
        if (this.activeTool != null) {
            this.activeTool.editor = this;
            this.activeTool.activate();
        }
    },
    getActiveTool:function () {
        return this.activeTool;
    },
    getDefaultTool:function () {
        if (this.defaultTool == null) {
            this.defaultTool = new anra.gef.SelectionTool();
            this.defaultTool.editor = this;
        }
        return this.defaultTool;
    },
    getTopDragTracker:function () {
        if (this.topDragTracker == null)
            this.topDragTracker = this.createTopDragTracker();
        return this.topDragTracker;
    },
    createTopDragTracker:function () {
        return new anra.gef.TopDragTracker(this);
    }
});


/**
 * 连线
 * @type {*}
 */
anra.gef.Line = anra.gef.Figure.extend(anra.svg.Polyline).extend({
    sourceAnchor:null,
    targetAnchor:null,
    router:null,
    _markListener:null,
    setStartMarker:function (marker) {
        this._setMarker('marker-start', marker);
    },
    setEndMarker:function (marker) {
        this._setMarker('marker-end', marker);
    },
    getStartMarker:function () {
        return this['marker-start'];
    },
    getEndMarker:function () {
        return this['marker-end'];
    },
    _setMarker:function (key, marker) {
        var m = this[key];
        if (m == marker)return;
        if (m != null) {
            this.svg.defs.removeChild(m);
            this.removeAttribute(key);
            if (m.propertyChanged != null && this.model != null)
                this.model.removePropertyListener(m, m.propKey);
        }
        this[key] = marker;
        if (marker != null) {
            if (marker.propertyChanged != null && this.model != null)
                this.model.addPropertyListener(marker, marker.propKey);
            this.svg.defs.addChild(marker);
            this.setAttribute(key, 'url(#' + marker.id + ')');
        }
    },
    dispose:function () {
        this.setStartMarker(null);
        this.setEndMarker(null);
        anra.gef.Figure.prototype.dispose.call(this);
    },
    paint:function () {
        if (this.router != null)
            this.points = this.router(this);
        var f = this;
        if (this.sourceAnchor != null && this.targetAnchor != null)
            this.setAttribute({
                d:f.compute()
            });
    },
    setSourceAnchor:function (anchor) {
        this.sourceAnchor = anchor;
        if (anchor == null)
            return;
        if (this.points == null)
            this.points = [];
        this.points[0] = anchor;
        if (this.points.length > 1)
            this.points[0] = ({
                x:anchor.x,
                y:anchor.y
            });
        else
            this.points.insert({
                x:anchor.x,
                y:anchor.y
            });
    },
    setTargetAnchor:function (anchor) {
        this.targetAnchor = anchor;
        if (anchor == null)
            return;
        if (this.points == null)
            this.points = [];
        if (this.points.length > 1)
            this.points[this.points.length - 1] = ({
                x:anchor.x,
                y:anchor.y
            });
        else
            this.points.push({
                x:anchor.x,
                y:anchor.y
            });
    }
});
var setPoint = function (o, t) {
    if (s != null)
        for (var k in t) {
            o[k] = t[k];
        }
};
/**
 * 曲线
 * @type {*|void}
 */
anra.gef.Polyline = anra.gef.Line.extend({
    points:null,
    tagName:'polyline'
});

/**
 * 路径线
 * @type {*|void}
 */
anra.gef.PathLine = anra.gef.Line.extend({
    points:null,
    tagName:'path'

});


anra.gef.BaseModel = Base.extend({
    pls:null,
    constructor:function () {
        this.properties = new Map();
    },
    /**
     * 输入应当为json
     * @param p
     * @param fire
     */
    setProperties:function (p, unfire) {
        var o, key;
        for (key in p) {
            o = this.properties.get(key);
            this.properties.set(key, p[key]);
            if (!unfire && this.pls) {
                this.pls.firePropertyChanged(key, o, p[key]);
            }
        }
    },
    getBounds:function () {
        return this.properties.get('bounds');
    },
    setBounds:function (b, unfire) {
        var old = this.getBounds();
        this.properties.put('bounds', b);
        if (!unfire && this.pls)
            this.pls.firePropertyChanged('bounds', old, b);
    },
    setValue:function (key, value, unfire) {
        var o = this.properties.get(key);
        this.properties.set(key, value);
        if (!unfire && this.pls) {
            this.pls.firePropertyChanged(key, o, value);
        }
    },
    addPropertyListener:function (l, k) {
        if (this.pls == null)
            this.pls = new anra.PropertyListenerSupport();
        this.pls.addPropertyListener(l, k);
    },
    removePropertyListener:function (l, k) {
        if (this.pls != null)
            this.pls.removePropertyListener(l, k);
    },
    getValue:function (key) {
        return this.properties.get(key);
    },
    hashCode:function () {
        if (this.uuid == null)
            this.uuid = anra.genUUID();
        return this.uuid;
    }
});

anra.gef.NodeModel = anra.gef.BaseModel.extend({
    sourceLines:null,
    targetLines:null,
    children:null,
    constructor:function () {
        anra.gef.BaseModel.prototype.constructor.call(this);
        this.sourceLines = new Map();
        this.targetLines = new Map();
        this.children = new Map();
    },
    hasSourceLine:function (line) {
        if (line instanceof anra.gef.LineModel) {
            return this.sourceLines.has(this.lineId(line.id))
        } else {
            return this.sourceLines.has(line);
        }
    },
    hasTargetLine:function (line) {
        if (line instanceof anra.gef.LineModel) {
            return this.targetLines.has(this.lineId(line.id));
        } else {
            return this.targetLines.has(line);
        }
    },
    addSourceLine:function (line) {
        var nId = this.lineId(line.id);
        line.sourceNode = this;
        if (!this.sourceLines.has(nId)) {
            this.sourceLines.put(nId, line);
            return true;
        }
        console.log('duplicate line id: ' + line.id);
        return false;
    },
    addTargetLine:function (line) {
        var nId = this.lineId(line.id);
        line.targetNode = this;
        if (!this.targetLines.has(nId)) {
            this.targetLines.put(nId, line);
            return true;
        }
        console.log('duplicate line id: ' + line.id);
        return false;
    },
    getSourceLine:function (id) {
        return this.sourceLines.get(this.lineId(id));
    },
    getTargetLine:function (id) {
        return this.targetLines.get(this.lineId(id));
    },
    lineId:function (id) {
        return this.id + '_' + id;
    },
    removeSourceLine:function (line) {
        var l, lk;
        if (line instanceof anra.gef.LineModel)
            lk = this.lineId(line.id);
        else
            lk = this.lineId(line);
        l = this.sourceLines.remove(lk);
        if (l != null)
            l.sourceNode = null;
    },
    removeTargetLine:function (line) {
        var l, lk;
        if (line instanceof anra.gef.LineModel)
            lk = this.lineId(line.id);
        else
            lk = this.lineId(line);
        l = this.targetLines.remove(lk);
        if (l != null)
            l.targetNode = null;
    },
    addChild:function (model) {
        this.children.put(model.id, model);
    },
    removeChild:function (model) {
        this.children.remove(model.id);
    },
    getChild:function (id) {
        return this.children.get(id);
    },
    getAllChildren:function () {
        return this.children.values();
    },
    getAllChildrenID:function () {
        return this.children.keys();
    },
    equals:function (o) {
        return this == o || this.id == o.id;
    }
});

anra.gef.ContentModel = anra.gef.NodeModel.extend({});

anra.gef.LineModel = anra.gef.BaseModel.extend({
    sourceNode:null,
    targetNode:null,
    equals:function (o) {
        return this == o || this.id == o.id;
    }
});

anra.gef.EditPartListener = Base.extend({
    class:'anra.gef.EditPartListener',
    childAdded:function (child, index) {
    },
    partActivated:function (editPart) {
    },
    partDeactivated:function (editpart) {
    },
    removingChild:function (child, index) {
    },
    selectedStateChanged:function (editPart) {
    }
});

anra.FigureUtil = {
    createGhostFigure:function (editPart) {
        var ghost = editPart.createFigure();
        editPart.refreshVisual.call({
            figure:ghost,
            model:editPart.model
        });
        ghost.setOpacity(0.5);
        ghost.disableEvent();
        return ghost;
    }
}


REQ_CONNECTION_START = "connection start";

REQ_CONNECTION_END = "connection end";

REQ_RECONNECT_SOURCE = "Reconnection source";

REQ_RECONNECT_TARGET = "Reconnection target";
REQ_MOVE_BENDPOINT = "move bendpoint";
REQ_CREATE_BENDPOINT = "create bendpoint";
REQ_RESIZE = "resize";
REQ_RESIZE_CHILDREN = "resize children";
REQ_MOVE = "move";
REQ_MOVE_CHILDREN = "move children";
REQ_OPEN = "open";
REQ_ORPHAN = "orphan";
REQ_ORPHAN_CHILDREN = "orphan children";
REQ_CREATE = "create child";
REQ_ADD = "add children";
REQ_CLONE = "clone";
REQ_DELETE = "delete";
REQ_DELETE_DEPENDANT = "delete dependant";
REQ_ALIGN = "align";
REQ_ALIGN_CHILDREN = "align children";
REQ_DIRECT_EDIT = "direct edit";
REQ_SELECTION = "selection";
REQ_SELECTION_HOVER = "selection hover";
REQ_DRAG_START = 'REQ_DRAG_START';
REQ_DRAG_MOVE = 'REQ_DRAG_MOVE';
REQ_DRAG_END = 'REQ_DRAG_END';

REQ_MOUSE_DOWN = 'REQ_MOUSE_DOWN';
REQ_MOUSE_UP = 'REQ_MOUSE_UP';