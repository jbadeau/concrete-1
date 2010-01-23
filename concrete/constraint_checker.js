// Concrete Model Editor
//
// Copyright (c) 2010 Martin Thiede
//
// Concrete is freely distributable under the terms of an MIT-style license.

Concrete.ConstraintChecker = Class.create({
	
	initialize: function(modelRoot, rootClasses, identifierProvider) {
		this.modelRoot = modelRoot;
		this.rootClasses = rootClasses;	
		this.identifierProvider = identifierProvider;
		this.featureConstraints = {};
	},

	addConstraint: function(constraint) {
		if (constraint instanceof Concrete.ConstraintChecker.FeatureValueConstraint) {
			this.featureConstraints[constraint.class()] = this.featureConstraints[constraint.class()] || {}
			this.featureConstraints[constraint.class()][constraint.feature()] = this.featureConstraints[constraint.class()][constraint.feature()] || [];
			this.featureConstraints[constraint.class()][constraint.feature()].push(constraint);
		}
	},
	
	// ModelChangeListener Interface
	
	elementAdded: function(element) {
	},

	elementChanged: function(element, feature) {
	},

	elementRemoved: function(element) {
	},
	
	rootChanged: function(root) {
	},

	commitChanges: function() {
		this._updateAllProblems();
	},

	// ModelChangeListener End
	
	isValidInstance: function(type, element) {
		var allowedTypes = type.allSubTypes().concat(type);
		return allowedTypes.include(element.mmClass);
	},
	
	isValidValue: function(mmFeature, value) {
		var opts = this.attributeOptions(mmFeature);
		return (!(opts instanceof RegExp) || opts.test(value)) &&
			((opts instanceof RegExp) || opts == undefined || opts.include(value));
	},
	
	attributeOptions: function(mmFeature) {
		if (mmFeature.type.isEnum()) {
			// enum
			return mmFeature.type.literals;
		}
		else if (mmFeature.type.isBoolean()) {
			return ["true", "false"];
		}
		else if (mmFeature.type.isInteger()) {
			return /^(-?[1-9]\d*|0)$/;
		}
		else {
			return undefined;
		}			
	},
	
	elementOptions: function(slot) {
		if (slot.hasClassName("ct_root")) {
			return this.rootClasses.reject(function(t){return t.abstract}).collect(function(c){ return c.name});
		}
		else {
			var type = slot.mmFeature().type;
			return type.allSubTypes().concat(type).reject(function(t){return t.abstract}).collect(function(t){ return t.name});
		}
	},

	_updateAllProblems: function() {
		this.modelRoot.childElements().each(function(e) { this._updateElementProblems(e); }, this);
	},
			
	_updateElementProblems: function(element) {
		if (!element.hasClassName("ct_element") || element.hasClassName("ct_empty")) return [];
		this._removeErrors(element);
		this._checkElement(element).each(function(p) { this._addError(element, p); }, this);
		element.features.each(function(f) {
			this._removeErrors(f);
			this._checkFeature(element, f).each(function(p) { this._addError(f, p); }, this);
			if (f.mmFeature.isContainment()) {
				f.slot.childElements().each(function(c) { this._updateElementProblems(c); }, this);
			}
		}, this);
	},
		
	_checkElement: function(element) {
		var problems = [];
		if (element.parentNode.hasClassName("ct_root")) {
			if (!this.rootClasses.include(element.mmClass)) {
				problems.push("element of class '"+element.mmClass.name+"' not allowed");				
			}			
		}
		else {
			if (!this.isValidInstance(element.mmFeature("ct_containment").type, element)) {
				problems.push("element of class '"+element.mmClass.name+"' not allowed");				
			}
		}		
		if (element.mmClass.abstract) {
			problems.push("class '"+element.mmClass.name+"' is abstract");
		}
		var ident = this.identifierProvider.getIdentifier(element);
		if (this.identifierProvider.getElement(ident) instanceof Array) {
			problems.push("duplicate identifier '"+ident+"'");
		}	
		return problems;
	},
	
	_checkFeature: function(element, feature) {
		var problems = [];
		var mmf = feature.mmFeature;
		var children = feature.slot.childElements().select(function(c) { return !c.hasClassName("ct_empty"); });
		var featureConstraints = this._featureConstraints(element, feature);
		if (mmf.upperLimit > -1 && children.size() > mmf.upperLimit) {
			if (mmf.upperLimit == 1) {
				if (mmf.isContainment()) {
					problems.push("only one element may be specified as '"+mmf.name+"'");
				}
				else {
					problems.push("only one value may be specified as '"+mmf.name+"'");					
				}
			}
			problems.push("above upper limit of '"+mmf.upperLimit+"'");	
		}
		if (mmf.lowerLimit > 0 && children.size() < mmf.lowerLimit) {
			if (mmf.lowerLimit == 1) {
				problems.push("'"+mmf.name+"' must be specified");	
			}
			else {
				problems.push("below lower limit of '"+mmf.upperLimit+"'");					
			}
		}
		if (mmf.isContainment()) {
			// correct element type is checked for each element
			children.each(function(c) {
				this._checkFeatureConstraints(featureConstraints, element, c, problems);
			}, this);
		}
		else if (mmf.isReference()) {
			children.each(function(c) {				
				var target = this.identifierProvider.getElement(c.textContent)
				if (target && !(target instanceof Array)) {
					if (!this.isValidInstance(mmf.type, target)) {
						problems.push("reference to class '"+target.mmClass.name+"' not allowed");				
					}
					else {
						this._checkFeatureConstraints(featureConstraints, element, target, problems);
					}
				}
				else {
					problems.push("can not resolve reference");
				}
			}, this);			
		}
		else {
			children.each(function(c) {
				if (!this.isValidValue(mmf, c.textContent)) {
					problems.push("value not allowed");
				}
				else {
					this._checkFeatureConstraints(featureConstraints, element, c.textContent, problems);
				}
			}, this);
		}
		return problems.uniq();
	},
	
	_featureConstraints: function(element, feature) {
		var byFeature = this.featureConstraints[element.mmClass.name]
		return (byFeature && byFeature[feature.mmFeature.name]) || [];		
	},

	_checkFeatureConstraints: function(constraints, element, value, problems) {
		constraints.each(function(c) {
			if (!c.check(element, value)) {
				problems.push(c.message(element));
			}
		});
	},
		
	_addError: function(node, text) {
		node.addClassName("ct_error");
		node.appendChild(Concrete.Helper.createDOMNode("div", {class: "ct_error_description", style: "display: none"}, text));	
	},
	
	_removeErrors: function(node) {
		node.select(".ct_error_description").each(function(c) {
			c.remove();
		});
		if (node.hasClassName("ct_error")) node.removeClassName("ct_error");
		node.select(".ct_error").each(function(c) {
			c.removeClassName("ct_error");
		});
	}
	
});

Concrete.ConstraintChecker.FeatureValueConstraint = Class.create({
	initialize: function(options) {
		this.options = options;		
	},
	class: function() {
		return this.options.class;
	},
	feature: function() {
		return this.options.feature;
	},
	check: function(element, value) {
		return this.options.checker(element, value);
	},
	message: function(element) {
		var msg = this.options.message;
		return Object.isFunction(msg) ? msg(element) : msg;
	}
});
